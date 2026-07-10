const pool = require("../../config/db"); // pg Pool instance

const { uploadToHostinger, convertAndUpload } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();

// Redis Cache
const {cachePost, ranking} = require("../../config/redisClient");

const createPost = async (req, res) => {
  try{
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM
      const { 
              // post based
              post_type, tags = [], isAnonymous,

                // content
                content_title, content_type, text_body, content_type_icon,

                // confession
                confession_title, confession_type, confession_type_icon,

                // question 
                question_type, question_title, question_related_to, question_related_to_icon,

                // repost 
                repost_title

            } = req.body;

      const userId = req.user.userId;

      if(!post_type){
        return res.status(404).json({ message: "Missing post type." });
      };

        // Generate only if anonymous
    let anonName = null;
    let anonColor = null;

    if (Number(isAnonymous) === 1 || isAnonymous === "1") {
      const anonymousName = () => {
        const generateNum = Array.from({ length: 6 }, () =>
          Math.floor(Math.random() * 10)
        ).join("");
        return `An${generateNum}nymous`;
      };

      const anonymousBgColor = () => {
        const colors = [
          "yellowgreen", "skyblue", "tomato", "yellow",
          "purple", "orange", "grey", "black", "brown",
          "pink", "cyan"
        ];
        const randomIndex = Math.floor(Math.random() * colors.length);
        return colors[randomIndex];
      };

      anonName = anonymousName();
      anonColor = anonymousBgColor();
    }

      const insertPostResult = await pool.query(
        "INSERT INTO posts (user_id, post_type, is_anonymous, anonymous_name, anonymous_bg_color) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [userId, post_type, isAnonymous, anonName, anonColor]
      );

      const postId = insertPostResult.rows[0].id;

      // Nomalize and storing Tags
      if (tags && tags.length > 0) {
        await Promise.all(tags.map(async (rawTag) => {
          const name = rawTag.trim().toLowerCase();
          const label = rawTag.trim();

          const tagResult = await pool.query("SELECT id FROM tags WHERE name = $1", [name]);
          const rows = tagResult.rows;

          let tagId;
          if (rows.length > 0) {
            tagId = rows[0].id;
          } else {
            const insertTagsResult = await pool.query(
              "INSERT INTO tags (name, label) VALUES ($1, $2) RETURNING id",
              [name, label]
            );
            tagId = insertTagsResult.rows[0].id;
          }

          await pool.query("INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)", [postId, tagId]);
        }));
      }

      const handler = {
        content: async() => {
            let mediaUrl = [];
            let mediaType = [];

            const contentFiles = req.files?.contentFile || [];
            const uploadPromises = contentFiles.map(f => convertAndUpload(f, "content"));
            const results = await Promise.all(uploadPromises);

            mediaUrl = results.map(r => r.url);
            mediaType = results.map(r => r.type);

            await pool.query(
              `INSERT INTO content(user_id, post_id, type, cate_icon, title, text_body, media_type, media_url)
                    VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [userId, postId, content_type, content_type_icon, content_title, text_body,JSON.stringify(mediaType), JSON.stringify(mediaUrl)]
            );
        },
        confession: async() => {
            let mediaUrl;
            let mediaType;

            const confessionFile = req.files?.confessionFile?.[0];
            if (confessionFile) {
            const result = await convertAndUpload(confessionFile, "confession");
            mediaUrl = result.url;
            mediaType = result.type;
            }
            const media_url = mediaUrl || null;
            const media_type = mediaType || null;

            await pool.query(
                `INSERT INTO confession(user_id, post_id, type, cate_icon, title, media_type, media_url) 
                VALUES($1, $2, $3, $4, $5, $6, $7)`,
                [userId, postId, confession_type, confession_type_icon, confession_title, media_type, media_url]
            );
        },
        question: async() => {
            let questionMediaUrl;
            const questionFile = req.files?.questionFile?.[0];
            if (questionFile) {
            const result = await convertAndUpload(questionFile, "question");
            questionMediaUrl = result.url;
            }
            const media_url = questionMediaUrl || null;
            
            const questionResult = await pool.query(
                "INSERT INTO question(post_id, question_type, title, media_url, type, cate_icon) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                [postId, question_type, question_title, media_url, question_related_to, question_related_to_icon]
            );

              const questionId = questionResult.rows[0].id;

              switch (question_type) {
                case "openend":
                  break;

                case "closedend":
                  break;

                case "range":
                  await pool.query(
                    "INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES ($1, $2, $3, $4, $5)",
                    [questionId, req.body.rangeMin, req.body.rangeMax, req.body.rangeStep, req.body.defaultRangeValue]
                  );
                  break;

               case "singlechoice":
                  const scResult = await pool.query(
                    "INSERT INTO singlechoice (question_id) VALUES ($1) RETURNING id",
                    [questionId]
                  );
                  const singleChoiceId = scResult.rows[0].id;

                  const singleChoices = req.body.choices || req.body["choices[]"] || [];
                  // Inserted sequentially (not Promise.all) so choice_text rows are
                  // created in the same order the user arranged them. Promise.all
                  // fires all inserts concurrently with no guarantee which one's
                  // connection finishes first, so auto-increment ids (and therefore
                  // display order) could come back scrambled even though the array
                  // itself arrived in the correct order.
                  for (const choice of singleChoices) {
                    try {
                      await pool.query(
                        "INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES ($1, $2)",
                        [singleChoiceId, choice]
                      );
                    } catch (err) {
                      console.error("Error inserting singlechoice option:", choice, err);
                    }
                  }
                  break;

                case "multiplechoice":
                  const mcResult = await pool.query(
                    "INSERT INTO multiplechoice (question_id, include_all_above) VALUES ($1, $2) RETURNING id",
                    [questionId, req.body.include_all_above]
                  );
                  const multipleChoiceId = mcResult.rows[0].id;

                  const multipleChoices = req.body.choices || req.body["choices[]"] || [];
                  // Same fix as singlechoice above: sequential inserts preserve order.
                  for (const choice of multipleChoices) {
                    try {
                      await pool.query(
                        "INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES ($1, $2)",
                        [multipleChoiceId, choice]
                      );
                    } catch (err) {
                      console.error("Error inserting multiplechoice option:", choice, err);
                    }
                  }
                  break;

                  case "rankingorder":
                    const roResult = await pool.query(
                      "INSERT INTO rankingorder (question_id) VALUES ($1) RETURNING id",
                      [questionId]
                    );
                    const rankingId = roResult.rows[0].id;

                    const rankingArray = req.body.ranking || [];
                    console.log("Ranking array received:", rankingArray);

                    await Promise.all(
                      rankingArray.map(async (value, index) => {
                        if (value) {
                            await pool.query(
                              "INSERT INTO ranking_item (ranking_id, position, item_text) VALUES ($1, $2, $3)",
                              [rankingId, index, value]
                            );
                        }
                      })
                    );
                    break;

                case "rating":
                  await pool.query(
                    "INSERT INTO rating (question_id, rating_icon_id) VALUES ($1, $2)",
                    [questionId, req.body.rating_icon_id]
                  );
                  break;

                default:
                  return res.status(400).json({ error: "Invalid question type" });
              }
        },
        repost: async() => {
            await pool.query(
              `INSERT INTO repost(post_id, title) VALUES($1,$2)`,
              [postId, repost_title]
            )
        }
      }
      
     if (!handler[post_type]) {
      return res.status(400).json({ code: 400, message: "Invalid post type" });
    }
    await handler[post_type]();

   // ====================================
// HYDRATE NEW POST FROM DB
// ====================================
const basePostsResult = await pool.query(`
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
    STRING_AGG(tg.label, ',') as tags
  FROM posts p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN post_tags pt ON pt.post_id = p.id
  LEFT JOIN tags tg ON tg.id = pt.tag_id
  WHERE p.id = $1
  GROUP BY p.id, u.id
`, [postId]);
const basePosts = basePostsResult.rows;

const hydratedPost = await hydratePostsFromDb(
  [postId],
  basePosts
);

const finalPost = hydratedPost[0];

// cache single post
await cachePost.set(
  `post:${postId}`,
  JSON.stringify(finalPost),
  { EX: 300 }
);

    // invalidate page caches
    const pageKeys = await cachePost.keys("posts:page:*");

    if (pageKeys.length) {
      await cachePost.del(pageKeys);
    }

    await ranking.zIncrBy(`hof:month:${currentMonth}`, 5, userId.toString());
    const postTypeRes = post_type.slice(0, 1).toUpperCase() + post_type.slice(1);
    res.status(200).json({ message: `${postTypeRes} uploaded successfully`, postId });

    }
    catch(error){
      console.error(error.message);
      return res.status(500).json({ message: "Sorry, Server Error" });
    }
};
const deletePost = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM
     
    const userId = req.user.userId;
    const { postId } = req.params ;

    // delete from DB
    const result = await pool.query(
      `
      DELETE FROM posts
      WHERE id = $1
      AND user_id = $2
      AND is_deleted = 0
      `,
      [postId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Post not found or already deleted" });
    }


    // delete single post cache
    await cachePost.del(`post:${postId}`);

    // invalidate all page caches
    const pageKeys = await cachePost.keys("posts:page:*");

    if (pageKeys.length) {
      await cachePost.del(pageKeys);
    }

    await ranking.zIncrBy(`hof:month:${currentMonth}`, -5, userId.toString());
    return res.status(200).json({
      message: "Post deleted successfully"
    });

  } catch (error) {

    console.error(error.message);

    return res.status(500).json({
      message: "Sorry, Server Error"
    });
  }
};


function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (err) {
    console.error("Invalid JSON in cache:", str);
    return null;
  }
}

const getAllPosts = async (req, res) => {
  try {
    const userId = req.user.userId;
    // const page = parseInt(req.query.page) || 1;
    const page = Math.max(
      1,
      Math.min(parseInt(req.query.page) || 1, 1000)
    );
    const limit = 25;
    const offset = (page - 1) * limit;

    const PAGE_KEY = `posts:page:${page}`;

    // ====================================
    // 1. CHECK PAGE IDS CACHE
    // ====================================
    const cachedIds = await cachePost.get(PAGE_KEY);

    if (cachedIds) {
      const ids = safeJsonParse(cachedIds) || [];

      if (ids.length) {

        // fetch all cached posts
        const pipeline = cachePost.multi();

        ids.forEach(id => {
          pipeline.get(`post:${id}`);
        });

        const results = await pipeline.exec();

        const cachedPostMap = new Map();
        const missingIds = [];

        // FIXED PIPELINE PARSING
        results.forEach((val, idx) => {

          if (!val) {
            missingIds.push(ids[idx]);
            return;
          }

          const parsed = safeJsonParse(val);

          if (parsed) {
            cachedPostMap.set(String(ids[idx]), parsed);
          } else {
            missingIds.push(ids[idx]);
          }
        });

        // ====================================
        // ALL POSTS FOUND IN CACHE
        // ====================================
        if (missingIds.length === 0) {

          const orderedPosts = ids
            .map(id => cachedPostMap.get(String(id)))
            .filter(Boolean);

            const personalized =
            await attachUserStates(orderedPosts, userId);

          console.log("CACHE HIT (page + posts)");

          return res.status(200).json({
            source: "cache",
            data: personalized
          });
        }

        // ====================================
        // PARTIAL CACHE HIT
        // ====================================
        console.log("PARTIAL CACHE HIT");

        const hydrated = await hydratePostsFromDb(missingIds);

        // cache hydrated posts
        const hydratePipeline = cachePost.multi();

        hydrated.forEach(post => {

          cachedPostMap.set(String(post.id), post);

          hydratePipeline.set(
            `post:${post.id}`,
            JSON.stringify(post),
            { EX: 300 }
          );
        });

        await hydratePipeline.exec();

        // preserve original order
        const orderedPosts = ids
          .map(id => cachedPostMap.get(String(id)))
          .filter(Boolean);

            const personalized = await attachUserStates(orderedPosts, userId);

        return res.status(200).json({
          source: "mixed",
          data: personalized
        });
      }
    }

    // ====================================
    // 2. FETCH FROM DATABASE
    // ====================================
    const postsResult = await pool.query(`
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
        STRING_AGG(tg.label, ',') as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      GROUP BY p.id, u.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const posts = postsResult.rows;

    if (!posts.length) {
      return res.status(200).json({
        source: "db",
        data: []
      });
    }

    // hydrate
    const final = await hydratePostsFromDb(
      posts.map(p => p.id),
      posts
    );

    // ====================================
    // 3. CACHE PAGE IDS + POSTS
    // ====================================
    const ids = final.map(p => p.id);

    await cachePost.set(
      PAGE_KEY,
      JSON.stringify(ids),
      { EX: 300 }
    );

    const pipeline = cachePost.multi();

    final.forEach(post => {
      pipeline.set(
        `post:${post.id}`,
        JSON.stringify(post),
        { EX: 300 }
      );
    });


    await pipeline.exec();

    const personalized =
  await attachUserStates(final, userId);

    console.log("DB HIT");

    return res.status(200).json({
      source: "db",
      data: personalized
      // data: final
    });

  } catch (err) {
    console.error("getAllPosts error:", err);

    return res.status(500).json({
      message: "Server error"
    });
  }
};



const getAllTrending = async (req, res) => {
  try {
    const userId = req.user.userId;
    const TRENDING_KEY = "trending:posts";
    const TRENDING_TTL = 180; // seconds

    // 1. Check cache for hydrated posts (no user states)
    const cached = await cachePost.get(TRENDING_KEY);
    if (cached) {
      const posts = safeJsonParse(cached);
      if (posts && posts.length) {
        const personalized = await attachUserStates(posts, userId);
        console.log("TRENDING CACHE HIT");
        return res.status(200).json({
          source: "cache",
          data: personalized,
        });
      }
    }

    // 2. Fetch from database – top 10 by score
    const rowsResult = await pool.query(`
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
        p.user_id,
        u.username,
        u.avatar_url,
        u.id as user_id,
        STRING_AGG(tg.label, ',') as tags,
        (p.likes_count + p.comments_count + p.views_count) as score
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      GROUP BY p.id, u.id
      ORDER BY score DESC
      LIMIT 10
    `);
    const rows = rowsResult.rows;

    if (!rows.length) {
      return res.status(200).json({
        source: "db",
        data: [],
      });
    }

    // 3. Hydrate posts (content/confession/question specific data)
    const ids = rows.map((p) => p.id);
    const hydratedPosts = await hydratePostsFromDb(ids, rows);

    // 4. Cache the hydrated posts (without user states)
    await cachePost.set(TRENDING_KEY, JSON.stringify(hydratedPosts), {
      EX: TRENDING_TTL,
    });

    // 5. Attach user‑specific flags (liked/favorited) and respond
    const personalized = await attachUserStates(hydratedPosts, userId);
    console.log("TRENDING DB HIT");
    return res.status(200).json({
      source: "db",
      data: personalized,
    });
  } catch (err) {
    console.error("getAllTrending error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};


const getUnsolvedQuestions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const CACHE_KEY = `unsolved_questions:page:${page}:limit:${limit}`;
    const CACHE_TTL = 60;

    // 1. Try cache
    const cached = await cachePost.get(CACHE_KEY);
    if (cached) {
      const posts = safeJsonParse(cached);
      if (posts && posts.length) {
        const personalized = await attachUserStates(posts, userId);
        console.log("UNSOLVED QUESTIONS CACHE HIT");
        return res.status(200).json({
          source: "cache",
          data: personalized,
        });
      }
    }

    // 2. Fetch from database - only unsolved questions (status = 'open')
    const rowsResult = await pool.query(`
      SELECT
        p.id,
        p.post_type,
        p.is_anonymous,
        p.anonymous_name,
        p.anonymous_bg_color,
        p.likes_count,
        p.comments_count,
        p.views_count,
        p.created_at,
        p.status as post_status,
        p.user_id,
        u.username,
        u.avatar_url,
        STRING_AGG(DISTINCT tg.label, ',') as tags,
        q.id as question_id,
        q.question_type,
        q.status as question_status,
        q.type,
        q.cate_icon,
        q.title,
        q.media_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN question q ON q.post_id = p.id   
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      WHERE p.post_type = 'question'
        AND q.status = 'open'               
      GROUP BY p.id, q.id, u.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const rows = rowsResult.rows;

    if (!rows.length) {
      return res.status(200).json({
        source: "db",
        data: [],
      });
    }

    // 3. Hydrate posts (adds rich `data` object for each question type)
    const ids = rows.map((r) => r.id);
    const hydratedPosts = await hydratePostsFromDb(ids, rows);

    // 4. Cache the hydrated results
    await cachePost.set(CACHE_KEY, JSON.stringify(hydratedPosts), {
      EX: CACHE_TTL,
    });

    // 5. Attach user-specific flags
    const personalized = await attachUserStates(hydratedPosts, userId);
    console.log("UNSOLVED QUESTIONS DB HIT");
    return res.status(200).json({
      source: "db",
      data: personalized,
    });

  } catch (err) {
    console.error("getUnsolvedQuestions error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};
async function attachUserStates(posts, userId) {

  const postIds = posts.map(p => p.id);

  // likes
  const likedRows = postIds.length
    ? (await pool.query(
        `
        SELECT post_id
        FROM post_likes
        WHERE user_id = $1
        AND post_id = ANY($2)
        `,
        [userId, postIds]
      )).rows
    : [];

  // favorites
  const favoriteRows = postIds.length
    ? (await pool.query(
        `
        SELECT post_id
        FROM post_favorites
        WHERE user_id = $1
        AND post_id = ANY($2)
        `,
        [userId, postIds]
      )).rows
    : [];

  const likedSet = new Set(
    likedRows.map(row => row.post_id)
  );

  const favoriteSet = new Set(
    favoriteRows.map(row => row.post_id)
  );

  return posts.map(post => ({
    ...post,

    is_liked:
      likedSet.has(post.id),

    is_favorited:
      favoriteSet.has(post.id)
  }));
}
async function hydratePostsFromDb(ids, basePosts = null) {

  let posts = basePosts;

  // fetch posts if not supplied
  if (!posts) {
    const rowsResult = await pool.query(`
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
        p.user_id,

        u.username,
        u.avatar_url,

        STRING_AGG(tg.label, ',') as tags

      FROM posts p

      JOIN users u
        ON p.user_id = u.id

      LEFT JOIN post_tags pt
        ON pt.post_id = p.id

      LEFT JOIN tags tg
        ON tg.id = pt.tag_id

      WHERE p.id = ANY($1)

      GROUP BY p.id, u.id

      ORDER BY array_position($2::int[], p.id)
    `, [ids, ids]);

    posts = rowsResult.rows;
  }

  // ====================================
  // SPLIT IDS
  // ====================================
  const contentIds = posts
    .filter(p => p.post_type === "content")
    .map(p => p.id);

  const confessionIds = posts
    .filter(p => p.post_type === "confession")
    .map(p => p.id);

  const questionIds = posts
    .filter(p => p.post_type === "question")
    .map(p => p.id);

  // ====================================
  // FETCH RELATED TABLES
  // ====================================
  const contents = contentIds.length
    ? (await pool.query(
        `SELECT * FROM content WHERE post_id = ANY($1)`,
        [contentIds]
      )).rows
    : [];

  const confessions = confessionIds.length
    ? (await pool.query(
        `SELECT * FROM confession WHERE post_id = ANY($1)`,
        [confessionIds]
      )).rows
    : [];

  const questions = questionIds.length
    ? (await pool.query(
        `SELECT * FROM question WHERE post_id = ANY($1)`,
        [questionIds]
      )).rows
    : [];

  const qIds = questions.map(q => q.id);

  // const closed = qIds.length
  //   ? (await pool.query(
  //       `SELECT * FROM closedend WHERE question_id = ANY($1)`,
  //       [qIds]
  //     )).rows
  //   : [];

  const ranges = qIds.length
    ? (await pool.query(
        `SELECT * FROM question_range WHERE question_id = ANY($1)`,
        [qIds]
      )).rows
    : [];

  const ratings = qIds.length
    ? (await pool.query(
        `SELECT * FROM rating WHERE question_id = ANY($1)`,
        [qIds]
      )).rows
    : [];

  // ORDER BY sco.id ASC added: without it MySQL doesn't guarantee row order
  // for this JOIN, so choices could come back scrambled in the UI even
  // though they were inserted in the correct order.
  const singleOptions = qIds.length
    ? (await pool.query(`
        SELECT sco.*, sc.question_id
        FROM singlechoice_option sco
        JOIN singlechoice sc
          ON sco.singlechoice_id = sc.id
        WHERE sc.question_id = ANY($1)
        ORDER BY sco.id ASC
      `, [qIds])).rows
    : [];

  // Same fix as singleOptions above.
  const multipleOptions = qIds.length
    ? (await pool.query(`
        SELECT
          mco.*,
          mc.question_id,
          mc.include_all_above
        FROM multiplechoice_option mco
        JOIN multiplechoice mc
          ON mco.multiplechoice_id = mc.id
        WHERE mc.question_id = ANY($1)
        ORDER BY mco.id ASC
      `, [qIds])).rows
    : [];

  // ranking_item already stores an explicit `position` column, which is the
  // authoritative order regardless of insert timing — sort by that instead
  // of id, and add it explicitly since it was previously missing here too.
  const rankingItems = qIds.length
    ? (await pool.query(`
        SELECT ri.*, ro.question_id
        FROM ranking_item ri
        JOIN rankingorder ro
          ON ri.ranking_id = ro.id
        WHERE ro.question_id = ANY($1)
        ORDER BY ri.position ASC
      `, [qIds])).rows
    : [];

  // ====================================
  // MAPS FOR FAST LOOKUP
  // ====================================
  const contentMap = new Map(
    contents.map(c => [c.post_id, c])
  );

  const confessionMap = new Map(
    confessions.map(c => [c.post_id, c])
  );

  const questionMap = new Map(
    questions.map(q => [q.post_id, q])
  );

  // const closedMap = new Map(
  //   closed.map(c => [c.question_id, c])
  // );

  const rangeMap = new Map(
    ranges.map(r => [r.question_id, r])
  );

  const ratingMap = new Map(
    ratings.map(r => [r.question_id, r])
  );

  // ====================================
  // BUILD FINAL RESPONSE
  // ====================================
  return posts.map(post => {

    let data = null;

    // ====================================
    // CONTENT
    // ====================================
    if (post.post_type === "content") {
      data = contentMap.get(post.id) || null;
    }

    // ====================================
    // CONFESSION
    // ====================================
    if (post.post_type === "confession") {
      data = confessionMap.get(post.id) || null;
    }

    // ====================================
    // QUESTION
    // ====================================
    if (post.post_type === "question") {

      const q = questionMap.get(post.id);

      if (!q) {
        return {
          ...post,
          data: null
        };
      }

      let extra = {};

      switch (q.question_type) {

        // case "closedend":
        //   extra = closedMap.get(q.id) || {};
        //   break;

        case "range":
          extra = rangeMap.get(q.id) || {};
          break;

        case "singlechoice":
          extra = {
            choices: singleOptions.filter(
              o => o.question_id === q.id
            )
          };
          break;

        case "multiplechoice":
          extra = {
            include_all_above:
              multipleOptions.find(
                o => o.question_id === q.id
              )?.include_all_above || false,

            choices: multipleOptions.filter(
              o => o.question_id === q.id
            )
          };
          break;

        case "rankingorder":
          extra = {
            items: rankingItems.filter(
              i => i.question_id === q.id
            )
          };
          break;

        case "rating":
          extra = ratingMap.get(q.id) || {};
          break;
      }

      data = {
        ...q,
        ...extra
      };
    }

    return {
      ...post,
      created_at: timeAgo(post.created_at),
      data
    };
  });
}


async function updateCachedPostLike(postId, isLike) {

  try {

    const key = `post:${postId}`;

    const cached = await cachePost.get(key);

    if (!cached) return;

    const parsed = safeJsonParse(cached);

    if (!parsed) return;

    // update count
    parsed.likes_count = isLike
      ? parsed.likes_count + 1
      : Math.max(parsed.likes_count - 1, 0);

    // get current ttl
    const ttl = await cachePost.ttl(key);

    console.log("TTL:", ttl);
    console.log("Updated likes_count:", parsed.likes_count);

    // preserve remaining ttl
    const result = await cachePost.set(
      key,
      JSON.stringify(parsed),
      ttl > 0
        ? { EX: ttl }
        : {}
    );

    console.log("Redis SET result:", result);

  } catch (err) {

    console.error("updateCachedPostLike error:", err);

  }
}
const likePost = async (req, res) => {
  const connection = await pool.connect();
  try{

    await connection.query('BEGIN');
    const userId = req.user.userId;

    const getUserName = await connection.query(
      `
      SELECT username
      FROM users
      WHERE id = $1
      `,
      [userId]
    )
    const username = getUserName.rows[0].username;

    const postId = req.params.postId;
    const ownerId = req.params.ownerId;

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const currentDay = today;
    const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM

    // check if like already
    const existingLikeResult = await connection.query(
      `
      SELECT id 
      FROM post_likes
      WHERE post_id = $1
      AND user_id = $2
      `,
      [postId, userId]
    );
    const existingLike = existingLikeResult.rows;

    // setup aggregateKey
    const aggregateKey = `post_like_${ownerId}_${postId}`;

    // unlike cuz post alr like
    if(existingLike.length > 0){


      // remove like
      await connection.query(
        `
        DELETE FROM post_likes
        WHERE post_id = $1 
        AND user_id = $2
        `,
        [postId, userId]
      );

      // decrease like count 
      await connection.query(
        `
        UPDATE posts
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = $1
        `,
        [postId]
      );

      //get updated total likes
      const likeDataResult = await connection.query(
        `
        SELECT COUNT(*) AS totalLikes
        FROM post_likes
        WHERE post_id = $1
        `,
        [postId]
      );
      const likeData = likeDataResult.rows[0];

      const totalLikes = likeData.totallikes;

      // if no like left delete notification
      if(Number(totalLikes) === 0){
        await connection.query(
          `
          DELETE FROM notifications
          WHERE aggregate_key = $1
          `,
          [aggregateKey]
        );
      }
      else{

        // get newest liker
                const latestLikerResult = await connection.query(
                    `
                    SELECT
                        cl.user_id,
                        u.username
                    FROM post_likes cl
                    JOIN users u
                        ON u.id = cl.user_id
                    WHERE cl.post_id = $1
                    ORDER BY cl.id DESC
                    LIMIT 1
                    `,
                    [postId]
                );
        const latestLiker = latestLikerResult.rows[0];

        let notificationContent;

        if(Number(totalLikes) === 1){
          notificationContent = 
          `${latestLiker?.username} liked your post` ;
        }
        else{
          notificationContent =
          `${latestLiker?.username} and ${Number(totalLikes) - 1} others liked your post`;
        }

        // update notification
        await connection.query(
          `
          UPDATE notifications
          SET 
            sender_id = $1,
            content = $2,
            is_viewed = 0,
            created_at = NOW()
          WHERE aggregate_key = $3
          `,
          [
            latestLiker.user_id,
            notificationContent,
            aggregateKey
          ]
        );
      }

      // success baby

      await updateCachedPostLike(postId, false);

       // Build today's trending key
      const todayTrendingKey = `trendingPost:day:${currentDay}`;

      // Check if today's trending key exists
      const exists = await ranking.exists(todayTrendingKey);
      if (exists) {
        // Only decrement if the key is for today
        await ranking.zIncrBy(todayTrendingKey, -2, postId.toString());
      }
      await ranking.zIncrBy(`hof:month:${currentMonth}`, -1, userId.toString());
      await connection.query('COMMIT');

   
      return res.json({
        liked: false
      });
    }

    // like logic start here
    await connection.query(
      `
      INSERT INTO post_likes
      (post_id, user_id)
      VALUES ($1, $2)
      `,
      [postId, userId]
    );

    // increase post like count

    await connection.query(
      `
      UPDATE posts
      SET likes_count = likes_count + 1
      WHERE id = $1
      `,
      [postId]
    );

    // notification like sent

    // no self noti logic
    if(Number(ownerId) !== Number(userId)){
      // const [[likeData]] = await connection.query(
      //   `
      //   SELECT COUNT(*) AS totalLikes
      //   FROM post_likes
      //   WHERE post_id = ?
      //   `,
      //   [postId]
      // );
       const likeDataResult2 = await connection.query(
        `
        SELECT likes_count
        FROM posts
        WHERE id = $1
        `,
        [postId]
      );
      const likeData = likeDataResult2.rows[0];

      const totalLikes = likeData.likes_count;

      let notificationContent;
      if(totalLikes === 1){
        notificationContent =
              `${username} liked your post`;
      }
      else{
         notificationContent =
              `${username} and ${totalLikes - 1} other${totalLikes - 1 > 1 ? 's' : ''} liked your post`;
      }

      // find exist aggregated noti
      const existingNotificationResult = await connection.query(
          `
          SELECT id
          FROM notifications
          WHERE aggregate_key = $1
          LIMIT 1
          `,
          [aggregateKey]
      );
      const existingNotification = existingNotificationResult.rows;
     

      // update existing noti
      if (existingNotification.length > 0) {

          await connection.query(
              `
              UPDATE notifications
              SET
                  sender_id = $1,
                  content = $2,
                  is_viewed = 0,
                  created_at = NOW()
              WHERE aggregate_key = $3
              `,
              [
                  userId,
                  notificationContent,
                  aggregateKey
              ]
          );
      }
      // create new noti
      else{
         await connection.query(
                    `
                    INSERT INTO notifications
                    (
                        receiver_id,
                        sender_id,
                        type,
                        content,
                        post_id,
                        aggregate_key,
                        is_viewed
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, 0)
                    `,
                    [
                        ownerId,
                        userId,
                        'post_like',
                        notificationContent,
                        postId,
                        aggregateKey
                    ]
                );
      }
    }
    // success baby
    await updateCachedPostLike(postId, true);
    await ranking.zIncrBy(`trendingPost:day:${currentDay}`, 2, postId.toString());
    await ranking.zIncrBy(`hof:month:${currentMonth}`, 0.5, userId.toString());
    await connection.query('COMMIT');


    return res.json({
      liked: true
    });
  }
  catch(err){

    await connection.query('ROLLBACK');

    console.error(err);

    return res.status(500).json({
        message: "Server error"
    });
}
  finally{
    connection.release();
  }

};

// favorite toggle
const favoritePost = async (req, res) => {

  const connection = await pool.connect();

  try {

    await connection.query('BEGIN');

    const userId = req.user.userId;

    const postId = req.params.postId;

    const existingResult = await connection.query(
      `
      SELECT id
      FROM post_favorites
      WHERE post_id = $1
      AND user_id = $2
      `,
      [postId, userId]
    );
    const existing = existingResult.rows;

    // REMOVE FAVORITE
    if (existing.length > 0) {

      await connection.query(
        `
        DELETE FROM post_favorites
        WHERE post_id = $1
        AND user_id = $2
        `,
        [postId, userId]
      );

      await connection.query('COMMIT');

      return res.json({
        favorited: false
      });
    }

    // ADD FAVORITE
    await connection.query(
      `
      INSERT INTO post_favorites
      (post_id, user_id)
      VALUES ($1, $2)
      `,
      [postId, userId]
    );

    await connection.query('COMMIT');

    return res.json({
      favorited: true
    });

  } catch (err) {

    await connection.query('ROLLBACK');

    console.error(err);

    return res.status(500).json({
      message: "Server error"
    });

  } finally {

    connection.release();

  }
};


const updatePostBodyContent = async (req, res) => {

  try {

    const userId = req.user.userId;

    const { contentId, postId } = req.params;

    const { bodyText } = req.body;

    await pool.query(
      `
      UPDATE content
      SET text_body = $1
      WHERE id = $2
      AND user_id = $3
      AND post_id = $4
      `,
      [bodyText, contentId, userId, postId]
    );

    // ====================================
    // INVALIDATE POST CACHE
    // ====================================
    await cachePost.del(`post:${postId}`);

    // ====================================
    // INVALIDATE PAGE CACHE
    // ====================================
    const pageKeys = await cachePost.keys("posts:page:*");

    if (pageKeys.length) {
      await cachePost.del(pageKeys);
    }

    return res.status(200).json({
      message: "Content updated successfully"
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      message: "Sorry, Server Error"
    });
  }
};

function timeAgo(date){

  // get the time now in ms
  const getTimeNow =  Date.now();

  // find the gap from post created_at in ms
  const DiffMs = getTimeNow - new Date(date).getTime();

  const seconds = Math.floor(DiffMs/1000);
  const minutes = Math.floor(seconds/60);
  const hours = Math.floor(minutes/60);
  const days = Math.floor(hours/24);
  const weeks   = Math.floor(days / 7);
  const months  = Math.floor(days / 30); 
  const years   = Math.floor(days / 365); 

  if(seconds < 60) return "Just now";
  if(minutes < 60) return `${minutes} mintute${minutes>1 ? "s" : ""} ago`;
  if (hours < 24)   return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7)     return `${days} day${days > 1 ? "s" : ""} ago`;
  if (weeks < 5)    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (months < 12)  return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

const getPostsByPostId = async (req, res) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.postId;
    const CACHE_KEY = `post:${postId}`; 
    
    const cached = await cachePost.get(CACHE_KEY);
    const parsed = safeJsonParse(cached);

    if (parsed) {
      // Attach user states to cached post (important!)
      const personalized = await attachUserStates([parsed], userId);
      return res.status(200).json({
        source: "cache",
        data: personalized[0]
      });
    }

    const postsResult = await pool.query(`
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
        STRING_AGG(tg.label, ',') as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      WHERE p.id = $1
      GROUP BY p.id, u.id
    `, [postId]);
    const posts = postsResult.rows;

    if (!posts.length) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    const ids = posts.map(p => p.id);
    const hydratedPosts = await hydratePostsFromDb(ids, posts);
    

    const personalized = await attachUserStates(hydratedPosts, userId);

    const post = personalized[0];

    const postToCache = {
      ...post,
      is_liked: undefined,
      is_favorited: undefined
    };
    
    await cachePost.set(CACHE_KEY, JSON.stringify(postToCache), { EX: 300 });

    return res.status(200).json({
      source: "db",
      data: post,
    });

  } catch (err) {
    console.error("getPostsByPostId error:", err);
    return res.status(500).json({
      message: "Server error"
    });
  }
};

const getPostsByLike = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;

    const rowsResult = await pool.query(
      `SELECT 
        p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color,
        p.created_at, p.user_id,
        u.username, u.avatar_url,
        COALESCE(c.title, cf.title, q.title) as title,
        COALESCE(c.media_url, cf.media_url, q.media_url) as mediasrc
      FROM post_likes pl
      JOIN posts p ON pl.post_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN content c ON p.id = c.post_id
      LEFT JOIN confession cf ON p.id = cf.post_id
      LEFT JOIN question q ON p.id = q.post_id
      WHERE pl.user_id = $1
      ORDER BY pl.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const rows = rowsResult.rows;

    const result = rows.map(r => ({
      id: r.id,
      title: r.title,
      author: r.is_anonymous ? r.anonymous_name : r.username,
      authurPf: r.is_anonymous ? null : r.avatar_url,
      isAnonymous: r.is_anonymous,
      anonymousBg: r.anonymous_bg_color,
      mediaSrc: r.mediasrc,
      createdAt: timeAgo(r.created_at)
    }));

    return res.status(200).json({
      source: "db",
      page,
      limit,
      data: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
const getPostsByFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;

    const rowsResult = await pool.query(
      `SELECT 
        p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color,
        p.created_at, p.user_id,
        u.username, u.avatar_url,
        COALESCE(c.title, cf.title, q.title) as title,
        COALESCE(c.media_url, cf.media_url, q.media_url) as mediasrc
      FROM post_favorites pl
      JOIN posts p ON pl.post_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN content c ON p.id = c.post_id
      LEFT JOIN confession cf ON p.id = cf.post_id
      LEFT JOIN question q ON p.id = q.post_id
      WHERE pl.user_id = $1
      ORDER BY pl.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const rows = rowsResult.rows;

    const result = rows.map(r => ({
      id: r.id,
      title: r.title,
      author: r.is_anonymous ? r.anonymous_name : r.username,
      authurPf: r.is_anonymous ? null : r.avatar_url,
      isAnonymous: r.is_anonymous,
      anonymousBg: r.anonymous_bg_color,
      mediaSrc: r.mediasrc,
      createdAt: timeAgo(r.created_at)
    }));

    return res.status(200).json({
      source: "db",
      page,
      limit,
      data: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

//   try {
//     const userId = req.user.userId; // current user
//     const CACHE_KEY = `likes:user:${userId}`;

//     // check cache
//     const cached = await cachePost.get(CACHE_KEY);
//     const parsed = safeJsonParse(cached);
//     if (parsed) {
//       return res.status(200).json({ source: "cache", data: parsed });
//     }

//     // fetch liked posts
//     const [rows] = await pool.query(
//       `SELECT 
//         p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color,
//         p.created_at, p.user_id,
//         u.username, u.avatar_url,
//         COALESCE(c.title, cf.title, q.title) as title,
//         COALESCE(c.media_url, cf.media_url, q.media_url) as mediaSrc
//       FROM post_likes pl
//       JOIN posts p ON pl.post_id = p.id
//       JOIN users u ON p.user_id = u.id
//       LEFT JOIN content c ON p.id = c.post_id
//       LEFT JOIN confession cf ON p.id = cf.post_id
//       LEFT JOIN question q ON p.id = q.post_id
//       WHERE pl.user_id = ?
//       ORDER BY pl.created_at DESC`,
//       [userId]
//     );

//     const result = rows.map(r => ({
//       id: r.id,
//       title: r.title,
//       author: r.is_anonymous ? r.anonymous_name : r.username,
//       authurPf: r.is_anonymous ? null : r.avatar_url,
//       isAnonymous: r.is_anonymous,
//       anonymousBg: r.anonymous_bg_color,
//       mediaSrc: r.mediaSrc,
//       createdAt: timeAgo(r.created_at)
//     }));

//     // cache for 5 minutes
//     await cachePost.set(CACHE_KEY, JSON.stringify(result), { EX: 300 });

//     return res.status(200).json({ source: "db", data: result });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };



// const markSolved = async (req, res) => {
//   const { id } = req.params;

//   await pool.query(
//     "UPDATE posts SET status='solved' WHERE id=? AND user_id=?",
//     [id, req.user.id]
//   );

//   res.json({ message: "Marked as solved" });
// };
// ================================
// GET POSTS BY USER ID (EXCLUDES ANONYMOUS POSTS)
// ================================
const getPostByUserId = async (req, res) => {
  try {
    const userId = req.user.userId;
    const targetUserId = req.params.userId;
    const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, 1000));
    const limit = 25;
    const offset = (page - 1) * limit;

    // ====================================
    // FETCH FROM DATABASE
    // ====================================
    const postsResult = await pool.query(`
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
        STRING_AGG(tg.label, ',') as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      WHERE p.user_id = $1
        AND p.is_anonymous = 0
      GROUP BY p.id, u.id
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [Number(targetUserId) || userId, limit, offset]);
    const posts = postsResult.rows;

    if (!posts.length) {
      return res.status(200).json({
        source: "db",
        data: []
      });
    }

    // Hydrate posts with their specific data
    const ids = posts.map(p => p.id);
    const hydratedPosts = await hydratePostsFromDb(ids, posts);

    // Attach user states (liked/favorited)
    const personalized = await attachUserStates(hydratedPosts, userId);

    return res.status(200).json({
      source: "db",
      data: personalized
    });

  } catch (err) {
    console.error("getPostByUserId error:", err);
    return res.status(500).json({
      message: "Server error"
    });
  }
};
const getPostByUserIds = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, 1000));
    const limit = 25;
    const offset = (page - 1) * limit;

    // ====================================
    // FETCH FROM DATABASE
    // ====================================
    const postsResult = await pool.query(`
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
        STRING_AGG(tg.label, ',') as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      WHERE p.user_id = $1
      GROUP BY p.id, u.id
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    const posts = postsResult.rows;

    // Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total 
       FROM posts p 
       WHERE p.user_id = $1 AND p.is_anonymous = 0`,
      [userId]
    );
    const totalPosts = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalPosts / limit);
    const hasMore = page < totalPages;

    if (!posts.length) {
      return res.status(200).json({
        source: "db",
        data: [],
        hasMore: false,
        totalPages: totalPages,
        currentPage: page
      });
    }

    // Hydrate posts with their specific data
    const ids = posts.map(p => p.id);
    const hydratedPosts = await hydratePostsFromDb(ids, posts);

    // Attach user states (liked/favorited)
    const personalized = await attachUserStates(hydratedPosts, userId);

    return res.status(200).json({
      data: personalized,
      hasMore: hasMore,
      totalPages: totalPages,
      currentPage: page,
      total: totalPosts
    });

  } catch (err) {
    console.error("getPostByUserId error:", err);
    return res.status(500).json({
      message: "Server error"
    });
  }
};
const markQuestionSolved = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // verify ownership first
    const ownedResult = await pool.query(
      `
      SELECT id
      FROM posts
      WHERE
        id = $1
        AND user_id = $2
        AND post_type = 'question'
      LIMIT 1
      `,
      [postId, userId]
    );
    const owned = ownedResult.rows;

    if (!owned.length) {
      return res.status(404).json({
        message: "Question not found"
      });
    }

    const result = await pool.query(
      `
      UPDATE question
      SET status = 'solved'
      WHERE
        post_id = $1
        AND status != 'solved'
      `,
      [postId]
    );

   
    if (!result.rowCount) {
      return res.status(400).json({
        message: "Question already solved"
      });
    }

    return res.status(200).json({
      message: "Question marked as solved"
    });

  } catch (err) {
    console.error("markQuestionSolved:", err);

    return res.status(500).json({
      message: "Server error"
    });
  }
};

module.exports = {

  createPost,
  upload,
  getAllPosts,
  getUnsolvedQuestions,
  updatePostBodyContent,
  deletePost,
  likePost,
  favoritePost,
  getPostsByLike,
  getPostsByFavorite,
  getPostByUserId,
  markQuestionSolved,
  getAllTrending,
  getPostsByPostId,
  getPostByUserIds
};