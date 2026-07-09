const pool = require("../../config/db");
const { ranking } = require("../../config/redisClient"); // adjust path to your redis file export

const MAX_QUERY_LENGTH = 50;
const AUTOCOMPLETE_KEY = "search:autocomplete"; // sorted set, score = times searched

// Escape LIKE's special characters for PostgreSQL
const escapeLikeValue = (value) => value.replace(/[%_\\]/g, (ch) => `\\${ch}`);

// Normalize + split into words: trims, collapses multi-space, removes stray
// symbols that aren't useful for matching (keeps letters/numbers/underscore/dash/space)
const tokenize = (raw) => {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}_\-\s]/gu, ""); // strip punctuation/symbols, keep unicode letters+numbers

  if (!cleaned) return [];
  return cleaned.split(" ").filter(Boolean).slice(0, 6); // cap at 6 words, sane limit
};

/* ===========================================================
   MAIN SEARCH (global smart search - users + posts)
   GET /api/search?q=hello&userLimit=5&postLimit=5
   =========================================================== */
const globalSearch = async (req, res) => {
  const rawQuery = req.query.q?.trim();
  if (!rawQuery) {
    return res.status(200).json({ users: [], posts: [] });
  }

  const q = rawQuery.slice(0, MAX_QUERY_LENGTH);
  const words = tokenize(q);

  if (words.length === 0) {
    return res.status(200).json({ users: [], posts: [] });
  }

  const currentUserId = req.user.userId;
  const userLimit = Math.min(Number(req.query.userLimit) || 5, 50);
  const postLimit = Math.min(Number(req.query.postLimit) || 5, 50);
  const userOffset = Number(req.query.userOffset) || 0;
  const postOffset = Number(req.query.postOffset) || 0;

  let users = [];
  let hydratedPosts = [];
  let userError = null;
  let postError = null;

  // ---------- USERS ----------
  // Match if EVERY typed word appears somewhere in username OR nickname.
  // Case-insensitive via LOWER() so it doesn't depend on table collation.
  if (userLimit > 0) {
    try {
      const wordConditions = words
        .map((_, index) => `(LOWER(username) LIKE $${index * 2 + 1} OR LOWER(nickname) LIKE $${index * 2 + 2})`)
        .join(" AND ");

      const wordParams = words.flatMap((w) => {
        const pattern = `%${escapeLikeValue(w.toLowerCase())}%`;
        return [pattern, pattern];
      });

      const result = await pool.query(
        `SELECT id, username, avatar_url, nickname
         FROM users
         WHERE (${wordConditions})
         AND id != $${wordParams.length + 1}
         ORDER BY username ASC
         LIMIT $${wordParams.length + 2} OFFSET $${wordParams.length + 3}`,
        [...wordParams, currentUserId, userLimit, userOffset]
      );

      users = result.rows;
    } catch (err) {
      userError = err;
      console.error("globalSearch USER query failed:", err.message, err.sql || "");
    }
  }

  // ---------- POSTS ----------
  // Build one searchable blob per post (title from whichever type table applies
  // + tags + post_type) then require every typed word to appear in that blob.
  if (postLimit > 0) {
    try {
      const wordConditions = words
        .map((_, index) => `LOWER(search_blob) LIKE $${index + 1}`)
        .join(" AND ");

      const wordParams = words.map((w) => `%${w.toLowerCase()}%`);

      const postResult = await pool.query(
        `
        SELECT * FROM (
          SELECT
            p.id,
            p.post_type,
            p.is_anonymous,
            p.anonymous_name,
            p.anonymous_bg_color,
            p.likes_count,
            p.comments_count,
            p.answers_count,
            p.views_count,
            p.created_at,
            p.status,
            u.username,
            u.avatar_url,
            u.id as user_id,
            STRING_AGG(DISTINCT tg.label, ' ') as tags,
            LOWER(CONCAT_WS(' ',
              COALESCE(c.title, ''),
              COALESCE(cf.title, ''),
              COALESCE(qs.title, ''),
              COALESCE(STRING_AGG(DISTINCT tg.label, ' '), ''),
              p.post_type
            )) as search_blob
          FROM posts p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN post_tags pt ON pt.post_id = p.id
          LEFT JOIN tags tg ON tg.id = pt.tag_id
          LEFT JOIN content c ON c.post_id = p.id AND p.post_type = 'content'
          LEFT JOIN confession cf ON cf.post_id = p.id AND p.post_type = 'confession'
          LEFT JOIN question qs ON qs.post_id = p.id AND p.post_type = 'question'
          GROUP BY p.id, u.id, u.username, u.avatar_url, c.title, cf.title, qs.title
        ) as searchable
        WHERE (${wordConditions})
        ORDER BY created_at DESC
        LIMIT $${wordParams.length + 1} OFFSET $${wordParams.length + 2}
        `,
        [...wordParams, postLimit, postOffset]
      );

      const postRows = postResult.rows;

      if (postRows.length) {
        const ids = postRows.map((p) => p.id);
        hydratedPosts = await hydratePostsFromDb(ids, postRows);
        hydratedPosts = await attachUserStates(hydratedPosts, currentUserId);
      }
    } catch (err) {
      postError = err;
      console.error("globalSearch POST query failed:", err.message, err.sql || "");
    }
  }

  // Track this search term for ranking (fire and forget, don't block response)
  trackSearchTerm(q).catch((e) => console.error("trackSearchTerm error:", e.message));

  return res.status(200).json({
    users,
    posts: hydratedPosts,
    hasMoreUsers: users.length === userLimit && userLimit > 0,
    hasMorePosts: hydratedPosts.length === postLimit && postLimit > 0,
    // debug info only shown if a query actually failed - remove in prod if you want
    ...(userError ? { userSearchError: userError.message } : {}),
    ...(postError ? { postSearchError: postError.message } : {}),
  });
};

/* ===========================================================
   AUTOCOMPLETE (redis ranking - global "what others searched")
   GET /api/search/autocomplete?q=he
   =========================================================== */
const getAutocomplete = async (req, res) => {
  try {
    const rawQuery = req.query.q?.trim().toLowerCase();
    if (!rawQuery) {
      return res.status(200).json([]);
    }

    if (!ranking.isOpen) {
      return res.status(200).json([]);
    }

    const allTerms = await ranking.zRangeWithScores(AUTOCOMPLETE_KEY, 0, -1, { REV: true });

    const matches = allTerms
      .filter((t) => t.value.includes(rawQuery))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((t) => t.value);

    return res.status(200).json(matches);
  } catch (err) {
    console.error("getAutocomplete error:", err.message);
    return res.status(200).json([]); // fail soft, autocomplete isn't critical
  }
};

/* ===========================================================
   Track a search term into redis ranking sorted set
   =========================================================== */
const trackSearchTerm = async (term) => {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return;
  if (!ranking.isOpen) return; // don't crash if redis down
  await ranking.zIncrBy(AUTOCOMPLETE_KEY, 1, normalized);
};

/* ===========================================================
   Reuse the same hydration/personalization logic from post feed
   =========================================================== */
function timeAgo(date) {
  const getTimeNow = Date.now();
  const DiffMs = getTimeNow - new Date(date).getTime();
  const seconds = Math.floor(DiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} mintute${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (weeks < 5) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

async function hydratePostsFromDb(ids, basePosts = null) {
  let posts = basePosts;

  try {
    if (!posts) {
      const result = await pool.query(
        `
        SELECT
          p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color,
          p.likes_count, p.comments_count, p.answers_count, p.views_count,
          p.created_at, p.status, p.user_id, u.username, u.avatar_url,
          STRING_AGG(tg.label, ' ') as tags
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN post_tags pt ON pt.post_id = p.id
        LEFT JOIN tags tg ON tg.id = pt.tag_id
        WHERE p.id = ANY($1::int[])
        GROUP BY p.id, u.id, u.username, u.avatar_url
        ORDER BY array_position($1::int[], p.id)
        `,
        [ids]
      );
      posts = result.rows;
    }

    const contentIds = posts.filter((p) => p.post_type === "content").map((p) => p.id);
    const confessionIds = posts.filter((p) => p.post_type === "confession").map((p) => p.id);
    const questionIds = posts.filter((p) => p.post_type === "question").map((p) => p.id);

    const contents = contentIds.length
      ? await pool.query(`SELECT * FROM content WHERE post_id = ANY($1::int[])`, [contentIds])
      : { rows: [] };

    const confessions = confessionIds.length
      ? await pool.query(`SELECT * FROM confession WHERE post_id = ANY($1::int[])`, [confessionIds])
      : { rows: [] };

    const questions = questionIds.length
      ? await pool.query(`SELECT * FROM question WHERE post_id = ANY($1::int[])`, [questionIds])
      : { rows: [] };

    const qIds = questions.rows.map((q) => q.id);

    const ranges = qIds.length
      ? await pool.query(`SELECT * FROM question_range WHERE question_id = ANY($1::int[])`, [qIds])
      : { rows: [] };
    const ratings = qIds.length
      ? await pool.query(`SELECT * FROM rating WHERE question_id = ANY($1::int[])`, [qIds])
      : { rows: [] };
    const singleOptions = qIds.length
      ? await pool.query(
          `SELECT sco.*, sc.question_id FROM singlechoice_option sco
           JOIN singlechoice sc ON sco.singlechoice_id = sc.id
           WHERE sc.question_id = ANY($1::int[])`,
          [qIds]
        )
      : { rows: [] };
    const multipleOptions = qIds.length
      ? await pool.query(
          `SELECT mco.*, mc.question_id, mc.include_all_above FROM multiplechoice_option mco
           JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
           WHERE mc.question_id = ANY($1::int[])`,
          [qIds]
        )
      : { rows: [] };
    const rankingItems = qIds.length
      ? await pool.query(
          `SELECT ri.*, ro.question_id FROM ranking_item ri
           JOIN rankingorder ro ON ri.ranking_id = ro.id
           WHERE ro.question_id = ANY($1::int[])`,
          [qIds]
        )
      : { rows: [] };

    const contentMap = new Map(contents.rows.map((c) => [c.post_id, c]));
    const confessionMap = new Map(confessions.rows.map((c) => [c.post_id, c]));
    const questionMap = new Map(questions.rows.map((q) => [q.post_id, q]));
    const rangeMap = new Map(ranges.rows.map((r) => [r.question_id, r]));
    const ratingMap = new Map(ratings.rows.map((r) => [r.question_id, r]));

    return posts.map((post) => {
      let data = null;

      if (post.post_type === "content") {
        data = contentMap.get(post.id) || null;
      }

      if (post.post_type === "confession") {
        data = confessionMap.get(post.id) || null;
      }

      if (post.post_type === "question") {
        const q = questionMap.get(post.id);
        if (!q) {
          return { ...post, created_at: timeAgo(post.created_at), data: null };
        }

        let extra = {};
        switch (q.question_type) {
          case "closedend":
            extra = closedMap.get(q.id) || {};
            break;
          case "range":
            extra = rangeMap.get(q.id) || {};
            break;
          case "singlechoice":
            extra = { choices: singleOptions.rows.filter((o) => o.question_id === q.id) };
            break;
          case "multiplechoice":
            extra = {
              include_all_above:
                multipleOptions.rows.find((o) => o.question_id === q.id)?.include_all_above || false,
              choices: multipleOptions.rows.filter((o) => o.question_id === q.id),
            };
            break;
          case "rankingorder":
            extra = { items: rankingItems.rows.filter((i) => i.question_id === q.id) };
            break;
          case "rating":
            extra = ratingMap.get(q.id) || {};
            break;
        }

        data = { ...q, ...extra };
      }

      return { ...post, created_at: timeAgo(post.created_at), data };
    });
  } catch (err) {
    console.error("hydratePostsFromDb failed:", err.message, err.sql || "");
    return posts.map((post) => ({ ...post, created_at: timeAgo(post.created_at), data: null }));
  }
}

async function attachUserStates(posts, userId) {
  try {
    const postIds = posts.map((p) => p.id);

    const likedRows = postIds.length
      ? await pool.query(
          `SELECT post_id FROM post_likes WHERE user_id = $1 AND post_id = ANY($2::int[])`,
          [userId, postIds]
        )
      : { rows: [] };

    const favoriteRows = postIds.length
      ? await pool.query(
          `SELECT post_id FROM post_favorites WHERE user_id = $1 AND post_id = ANY($2::int[])`,
          [userId, postIds]
        )
      : { rows: [] };

    const likedSet = new Set(likedRows.rows.map((r) => r.post_id));
    const favoriteSet = new Set(favoriteRows.rows.map((r) => r.post_id));

    return posts.map((post) => ({
      ...post,
      is_liked: likedSet.has(post.id),
      is_favorited: favoriteSet.has(post.id),
    }));
  } catch (err) {
    console.error("attachUserStates failed:", err.message, err.sql || "");
    return posts.map((post) => ({ ...post, is_liked: false, is_favorited: false }));
  }
}

module.exports = { globalSearch, getAutocomplete };