const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
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

      const [result] = await pool.query(
        "INSERT INTO posts (user_id, post_type, is_anonymous, anonymous_name, anonymous_bg_color) VALUES (?, ?, ?, ?, ?)",
        [userId, post_type, isAnonymous, anonName, anonColor]
      );

      const postId = result.insertId;

      // Nomalize and storing Tags
      if (tags && tags.length > 0) {
        await Promise.all(tags.map(async (rawTag) => {
          const name = rawTag.trim().toLowerCase();
          const label = rawTag.trim();

          const [rows] = await pool.query("SELECT id FROM tags WHERE name = ?", [name]);

          let tagId;
          if (rows.length > 0) {
            tagId = rows[0].id;
          } else {
            const [insertTags] = await pool.query(
              "INSERT INTO tags (name, label) VALUES (?, ?)",
              [name, label]
            );
            tagId = insertTags.insertId;
          }

          await pool.query("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tagId]);
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
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
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
                VALUE(?, ?, ?, ?, ?, ?, ?)`,
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
            
            const [questionResult] = await pool.query(
                "INSERT INTO question(post_id, question_type, title, media_url, type, question_related_to_icon) VALUES (?, ?, ?, ?, ?, ?)",
                [postId, question_type, question_title, media_url, question_related_to, question_related_to_icon]
            );

              const questionId = questionResult.insertId;

              switch (question_type) {
                case "openend":
                  // await pool.query(
                  //   "INSERT INTO openend (question_id) VALUES (?)",
                  //   [questionId]
                  // );
                  break;

                case "closedend":

                  // await pool.query(
                  //   "INSERT INTO closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)",
                  //   [questionId, req.body.yesTitle, req.body.noTitle]
                  // );
                  break;

                case "range":
                  
                  await pool.query(
                    "INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES (?, ?, ?, ?, ?)",
                    [questionId, req.body.rangeMin, req.body.rangeMax, req.body.rangeStep, req.body.defaultRangeValue]
                  );
                  break;

               case "singlechoice":
                  const [sc] = await pool.query(
                    "INSERT INTO singlechoice (question_id) VALUES (?)",
                    [questionId]
                  );
                  const singleChoiceId = sc.insertId;

                  const singleChoices = req.body.choices || req.body["choices[]"] || [];
                  await Promise.all(
                    singleChoices.map(async (choice) => {
                      try {
                        await pool.query(
                          "INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)",
                          [singleChoiceId, choice]
                        );
                      } catch (err) {
                        console.error("Error inserting singlechoice option:", choice, err);
                      }
                    })
                  );
                  break;

                case "multiplechoice":
                  const [mc] = await pool.query(
                    "INSERT INTO multiplechoice (question_id, include_all_above) VALUES (?, ?)",
                    [questionId, req.body.include_all_above]
                  );
                  const multipleChoiceId = mc.insertId;

                  const multipleChoices = req.body.choices || req.body["choices[]"] || [];
                  await Promise.all(
                    multipleChoices.map(async (choice) => {
                      try {
                        await pool.query(
                          "INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)",
                          [multipleChoiceId, choice]
                        );
                      } catch (err) {
                        console.error("Error inserting multiplechoice option:", choice, err);
                      }
                    })
                  );
                  break;

                  case "rankingorder":
                    const [ro] = await pool.query(
                      "INSERT INTO rankingorder (question_id) VALUES (?)",
                      [questionId]
                    );
                    const rankingId = ro.insertId;

                    const rankingArray = req.body.ranking || [];
                    console.log("Ranking array received:", rankingArray);

                    await Promise.all(
                      rankingArray.map(async (value, index) => {
                        if (value) {
                            await pool.query(
                              "INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)",
                              [rankingId, index, value]
                            );
                        }
                      })
                    );
                    break;

                case "rating":

                  await pool.query(
                    "INSERT INTO rating (question_id, rating_icon_id) VALUES (?, ?)",
                    [questionId, req.body.rating_icon_id]
                  );
                  break;

                default:
                  return res.status(400).json({ error: "Invalid question type" });
              }
        },
        repost: async() => {
            await pool.query(
              `INSERT INTO repost(post_id, title) VALUE(?,?)`,
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
const [basePosts] = await pool.query(`
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
    p.status,
    u.username,
    GROUP_CONCAT(tg.label) as tags
  FROM posts p
  JOIN users u ON p.user_id = u.id
  LEFT JOIN post_tags pt ON pt.post_id = p.id
  LEFT JOIN tags tg ON tg.id = pt.tag_id
  WHERE p.id = ?
  GROUP BY p.id
`, [postId]);

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
      await Errors(error.message, error.code, "post-controller", error.stack);
      return res.status(500).json({ message: "Sorry, Server Error" });
    }
}; 


// all post type
const deletePost = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM
     
    const userId = req.user.userId;
    const { postId } = req.params ;

    // delete from DB
    const [result] = await pool.query(
      `
      DELETE FROM posts
      WHERE id = ?
      AND user_id = ?
      AND is_deleted = 0
      `,
      [postId, userId]
    );

    if (result.affectedRows === 0) {
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

// ================================
// GET ALL POSTS
// ================================
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
    const [posts] = await pool.query(`
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
        p.status,
        u.username,
        u.avatar_url,
        u.id as user_id,
        GROUP_CONCAT(tg.label) as tags
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_tags pt ON pt.post_id = p.id
      LEFT JOIN tags tg ON tg.id = pt.tag_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

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
async function attachUserStates(posts, userId) {

  const postIds = posts.map(p => p.id);

  // likes
  const [likedRows] = postIds.length
    ? await pool.query(
        `
        SELECT post_id
        FROM post_likes
        WHERE user_id = ?
        AND post_id IN (?)
        `,
        [userId, postIds]
      )
    : [[]];

  // favorites
  const [favoriteRows] = postIds.length
    ? await pool.query(
        `
        SELECT post_id
        FROM post_favorites
        WHERE user_id = ?
        AND post_id IN (?)
        `,
        [userId, postIds]
      )
    : [[]];

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
// async function updateCachedPostLike(postId, isLike) {

//   try {

//     const cached = await cachePost.get(`post:${postId}`);

//     if (!cached) return;

//     const parsed = safeJsonParse(cached);

//     if (!parsed) return;

//     parsed.likes_count = isLike
//       ? parsed.likes_count + 1
//       : Math.max(parsed.likes_count - 1, 0);

//       console.log("TTL:", ttl);
//       console.log("Before:", parsed.likes_count);

//     const ttl = await cachePost.ttl(`post:${postId}`);

//     const result = await cachePost.set(
//       `post:${postId}`,
//       JSON.stringify(parsed),
//       ttl > 0 ? { EX: ttl } : {}
//     );
//         console.log(result);

//   } catch (err) {

//     console.error("updateCachedPostLike error:", err);

//   }
// }
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
// ================================
// HYDRATE POSTS
// ================================
async function hydratePostsFromDb(ids, basePosts = null) {

  let posts = basePosts;

  // fetch posts if not supplied
  if (!posts) {
    const [rows] = await pool.query(`
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
        p.status,
        p.user_id,

        u.username,
        u.avatar_url,

        GROUP_CONCAT(tg.label) as tags

      FROM posts p

      JOIN users u
        ON p.user_id = u.id

      LEFT JOIN post_tags pt
        ON pt.post_id = p.id

      LEFT JOIN tags tg
        ON tg.id = pt.tag_id

      WHERE p.id IN (?)

      GROUP BY p.id

      ORDER BY FIELD(p.id, ?)
    `, [ids, ids]);

    posts = rows;
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
  const [contents] = contentIds.length
    ? await pool.query(
        `SELECT * FROM content WHERE post_id IN (?)`,
        [contentIds]
      )
    : [[]];

  const [confessions] = confessionIds.length
    ? await pool.query(
        `SELECT * FROM confession WHERE post_id IN (?)`,
        [confessionIds]
      )
    : [[]];

  const [questions] = questionIds.length
    ? await pool.query(
        `SELECT * FROM question WHERE post_id IN (?)`,
        [questionIds]
      )
    : [[]];

  const qIds = questions.map(q => q.id);

  const [closed] = qIds.length
    ? await pool.query(
        `SELECT * FROM closedend WHERE question_id IN (?)`,
        [qIds]
      )
    : [[]];

  const [ranges] = qIds.length
    ? await pool.query(
        `SELECT * FROM question_range WHERE question_id IN (?)`,
        [qIds]
      )
    : [[]];

  const [ratings] = qIds.length
    ? await pool.query(
        `SELECT * FROM rating WHERE question_id IN (?)`,
        [qIds]
      )
    : [[]];

  const [singleOptions] = qIds.length
    ? await pool.query(`
        SELECT sco.*, sc.question_id
        FROM singlechoice_option sco
        JOIN singlechoice sc
          ON sco.singlechoice_id = sc.id
        WHERE sc.question_id IN (?)
      `, [qIds])
    : [[]];

  const [multipleOptions] = qIds.length
    ? await pool.query(`
        SELECT
          mco.*,
          mc.question_id,
          mc.include_all_above
        FROM multiplechoice_option mco
        JOIN multiplechoice mc
          ON mco.multiplechoice_id = mc.id
        WHERE mc.question_id IN (?)
      `, [qIds])
    : [[]];

  const [rankingItems] = qIds.length
    ? await pool.query(`
        SELECT ri.*, ro.question_id
        FROM ranking_item ri
        JOIN rankingorder ro
          ON ri.ranking_id = ro.id
        WHERE ro.question_id IN (?)
      `, [qIds])
    : [[]];

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

  const closedMap = new Map(
    closed.map(c => [c.question_id, c])
  );

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

        case "closedend":
          extra = closedMap.get(q.id) || {};
          break;

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
const likePost = async (req, res) => {
  const connection = await pool.getConnection();
  try{

    await connection.beginTransaction();
    const userId = req.user.userId;
    const username = 'test';

    const postId = req.params.postId;
    const ownerId = req.params.ownerId;

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const currentDay = today;
    const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM

    // check if like already
    const [existingLike] = await connection.query(
      `
      SELECT id 
      FROM post_likes
      WHERE post_id = ?
      AND user_id = ?
      `,
      [postId, userId]
    );

    // setup aggregateKey
    const aggregateKey = `post_like_${ownerId}_${postId}`;

    // unlike cuz post alr like
    if(existingLike.length > 0){


      // remove like
      await connection.query(
        `
        DELETE FROM post_likes
        WHERE post_id = ? 
        AND user_id = ?
        `,
        [postId, userId]
      );

      // decrease like count 
      await connection.query(
        `
        UPDATE posts
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = ?
        `,
        [postId]
      );

      //get updated total likes
      const [[likeData]] = await connection.query(
        `
        SELECT COUNT(*) AS totalLikes
        FROM post_likes
        WHERE post_id = ?
        `,
        [postId]
      );

      const totalLikes = likeData.totalLikes;

      // if no like left delete notification
      if(totalLikes === 0){
        await connection.query(
          `
          DELETE FROM notifications
          WHERE aggregate_key = ?
          `,
          [aggregateKey]
        );
      }
      else{

        // get newest liker
                const [[latestLiker]] = await connection.query(
                    `
                    SELECT
                        cl.user_id,
                        u.username
                    FROM post_likes cl
                    JOIN users u
                        ON u.id = cl.user_id
                    WHERE cl.post_id = ?
                    ORDER BY cl.id DESC
                    LIMIT 1
                    `,
                    [postId]
                );

        let notificationContent;

        if(totalLikes === 1){
          notificationContent = 
          `${latestLiker?.username} liked your post` ;
        }
        else{
          notificationContent =
          `${latestLiker?.username} and ${totalLikes - 1} others liked your post`;
        }

        // update notification
        await connection.query(
          `
          UPDATE notifications
          SET 
            sender_id = ?,
            content = ?,
            is_viewed = 0,
            created_at = NOW()
          WHERE aggregate_key = ?
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
      await connection.commit();

   
      return res.json({
        liked: false
      });
    }

    // like logic start here
    await connection.query(
      `
      INSERT INTO post_likes
      (post_id, user_id)
      VALUES (?, ?)
      `,
      [postId, userId]
    );

    // increase post like count

    await connection.query(
      `
      UPDATE posts
      SET likes_count = likes_count + 1
      WHERE id = ?
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
       const [[likeData]] = await connection.query(
        `
        SELECT likes_count
        FROM posts
        WHERE id = ?
        `,
        [postId]
      );

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
      const [existingNotification] = await connection.query(
          `
          SELECT id
          FROM notifications
          WHERE aggregate_key = ?
          LIMIT 1
          `,
          [aggregateKey]
      );
     

      // update existing noti
      if (existingNotification.length > 0) {

          await connection.query(
              `
              UPDATE notifications
              SET
                  sender_id = ?,
                  content = ?,
                  is_viewed = 0,
                  created_at = NOW()
              WHERE aggregate_key = ?
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
                    VALUES (?, ?, ?, ?, ?, ?, 0)
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
    await connection.commit();


    return res.json({
      liked: true
    });
  }
  catch(err){

    await connection.rollback();

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

  const connection = await pool.getConnection();

  try {

    await connection.beginTransaction();

    const userId = req.user.userId;

    const postId = req.params.postId;

    const [existing] = await connection.query(
      `
      SELECT id
      FROM post_favorites
      WHERE post_id = ?
      AND user_id = ?
      `,
      [postId, userId]
    );

    // REMOVE FAVORITE
    if (existing.length > 0) {

      await connection.query(
        `
        DELETE FROM post_favorites
        WHERE post_id = ?
        AND user_id = ?
        `,
        [postId, userId]
      );

      await connection.commit();

      return res.json({
        favorited: false
      });
    }

    // ADD FAVORITE
    await connection.query(
      `
      INSERT INTO post_favorites
      (post_id, user_id)
      VALUES (?, ?)
      `,
      [postId, userId]
    );

    await connection.commit();

    return res.json({
      favorited: true
    });

  } catch (err) {

    await connection.rollback();

    console.error(err);

    return res.status(500).json({
      message: "Server error"
    });

  } finally {

    connection.release();

  }
};

// ================================
// UPDATE CONTENT
// ================================
const updatePostBodyContent = async (req, res) => {

  try {

    const userId = req.user.userId;

    const { contentId, postId } = req.params;

    const { bodyText } = req.body;

    await pool.query(
      `
      UPDATE content
      SET text_body = ?
      WHERE id = ?
      AND user_id = ?
      AND post_id = ?
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

const getPostsById = async(req, res)=>{

  try{
    const {id} = req.params;
    const CACHE_KEY = `post:${id}`; // align with layered cache naming
    const cached = await cachePost.get(CACHE_KEY);

   const parsed = safeJsonParse(cached);

    if (parsed) {
      return res.status(200).json({
        source: "cache",
        data: parsed
      });
    }

    const [aboutpost] = await pool.query(
      `SELECT 
        p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color, p.status, p.views_count, p.comments_count, p.likes_count,
        p.created_at, p.user_id,
        u.username,
        GROUP_CONCAT(tg.label) as tags
        FROM posts p 
        JOIN users u ON p.user_id = u.id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags tg ON pt.tag_id = tg.id
        WHERE p.id = ?
        GROUP BY p.id`,
      [id]
    )
    if (!aboutpost.length) {
      return res.status(404).json({ message: "Post not found or deleted" });
    }

    const post = aboutpost[0];

    let data = null;
   
    if(post.post_type === 'content'){
      const [datas] = await pool.query(
        `SELECT id, type, title, text_body, media_url FROM content WHERE post_id = ?`,
        [id]
      )
      data = datas[0];
    };
    
    if(post.post_type === 'confession'){
      const [datas] = await pool.query(
        `SELECT id, type, title, media_url FROM confession WHERE post_id = ?`,
        [id]
      )
      data = datas[0];
    };

    if(post.post_type === 'question'){
      const [rows] = await pool.query(
          `SELECT id, question_type, question_related_to, title, media_url FROM question WHERE post_id = ?`,
          [id]
        );
        const row = rows[0];
        switch(row.question_type){   

          case 'range' :
            const [rangeRows] = await pool.query(
                `SELECT * FROM question_range WHERE question_id = ?`,
                [row.id]
              );
            const range = rangeRows[0] || {};
            data = { ...row, ...range };
            break;

          case 'rating':
            const [ratingRows] = await pool.query(
              `SELECT * FROM rating WHERE question_id = ?`,
              [row.id]
            );
            const rating = ratingRows[0] || {};
            data = { ...row, ...rating };
            break;
          
          case 'singlechoice':
            const [singleRows] = await pool.query(`
              SELECT sco.*, sc.question_id
              FROM singlechoice_option sco
              JOIN singlechoice sc ON sco.singlechoice_id = sc.id
              WHERE sc.question_id = ?`, [row.id]);
            data = { ...row, choices: singleRows };
            break;

          case 'multiplechoice':
            const [multiRows] = await pool.query(`
              SELECT mco.*, mc.question_id
              FROM multiplechoice_option mco
              JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
              WHERE mc.question_id = ?`, [row.id]);
            data = { ...row, choices: multiRows };
            break;

          case 'rankingorder' :
            const [rankRows] = await pool.query(`
              SELECT ri.*, ro.question_id
              FROM ranking_item ri
              JOIN rankingorder ro ON ri.ranking_id = ro.id
              WHERE ro.question_id = ?`, [row.id]);
            data = { ...row, items: rankRows };
            break;
        }
    }
    const final = {
      ...post,
      created_at: timeAgo(post.created_at),
      data
    };
    // const final = { ...post, ...data };
     
    // cache hydrated post
    await cachePost.set(CACHE_KEY, JSON.stringify(final), { EX: 300 });

    return res.status(200).json({
      source: "db",
      data: final,
    });

  }
  catch(err){
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
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


// const markSolved = async (req, res) => {
//   const { id } = req.params;

//   await pool.query(
//     "UPDATE posts SET status='solved' WHERE id=? AND user_id=?",
//     [id, req.user.id]
//   );

//   res.json({ message: "Marked as solved" });
// };






module.exports = {

  createPost,
  // markSolved,
  upload,
  getAllPosts,
  getPostsById,
  updatePostBodyContent,
  deletePost,
  likePost,
  favoritePost
 
};

// async function attachLikeState(posts, userId) {

//   const postIds = posts.map(p => p.id);

//   const [likedRows] = postIds.length
//     ? await pool.query(
//         `
//         SELECT post_id
//         FROM post_likes
//         WHERE user_id = ?
//         AND post_id IN (?)
//         `,
//         [userId, postIds]
//       )
//     : [[]];

//   const likedSet = new Set(
//     likedRows.map(row => row.post_id)
//   );

//   return posts.map(post => ({
//     ...post,
//     is_liked: likedSet.has(post.id)
//   }));
// }
// const getAllPosts = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 25;
//     const offset = (page - 1) * limit;
  
//     const CACHE_KEY = `posts:page:${page}`;

//     // =====================
//     // 1. CHECK CACHE FIRST
//     // =====================
//     const cached = await cachePost.get(CACHE_KEY);

//     if (cached) {
//       console.log("CACHE HIT");
//       return res.status(200).json({
//         source: "cache",
//         data: JSON.parse(cached),
//       });
//     }

   

//     // =====================
//     // 2. GET BASE POSTS
//     // =====================
//      const [posts] = await pool.query(`
//       SELECT
//         p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color, p.likes_count, p.comments_count, p.views_count,
//         p.created_at, p.status,
//         u.username,
//         GROUP_CONCAT(tg.label) as tags
//       FROM posts p
//       JOIN users u ON p.user_id = u.id
//       LEFT JOIN post_tags pt ON pt.post_id = p.id 
//       LEFT JOIN tags tg ON tg.id = pt.tag_id
//       GROUP BY p.id
//       ORDER BY p.created_at DESC
//       LIMIT ? OFFSET ?
//     `, [limit, offset]);

//     if (!posts.length) {
//       return res.status(200).json({ source: "db", data: [] });
//     }

//     // =====================
//     // 3. SPLIT IDS BY TYPE
//     // =====================
//     const contentIds = [];
//     const confessionIds = [];

//     const questionIds = [];

//     posts.forEach((p) => {

//       if (p.post_type === "content") contentIds.push(p.id);
//       if (p.post_type === "confession") confessionIds.push(p.id);
//       if (p.post_type === "question") questionIds.push(p.id);

//     });

//     // =====================
//     // 4. FETCH RELATED DATA
//     // =====================
//     const [contents] = contentIds.length
//       ? await pool.query(`SELECT * FROM content WHERE post_id IN (?)`, [contentIds])
//       : [[]];

//     const [confessions] = confessionIds.length
//       ? await pool.query(`SELECT * FROM confession WHERE post_id IN (?)`, [confessionIds])
//       : [[]];

//     const [questions] = questionIds.length
//       ? await pool.query(`SELECT * FROM question WHERE post_id IN (?)`, [questionIds])
//       : [[]];

//     // get question ids
//     const qIds = questions.map((q) => q.id);

//     const [closed] = qIds.length
//       ? await pool.query(`SELECT * FROM closedend WHERE question_id IN (?)`, [qIds])
//       : [[]];

//     const [ranges] = qIds.length
//       ? await pool.query(`SELECT * FROM question_range WHERE question_id IN (?)`, [qIds])
//       : [[]];

//     const [ratings] = qIds.length
//       ? await pool.query(`SELECT * FROM rating WHERE question_id IN (?)`, [qIds])
//       : [[]];

//     const [singleOptions] = qIds.length
//       ? await pool.query(`
//         SELECT sco.*, sc.question_id
//         FROM singlechoice_option sco
//         JOIN singlechoice sc ON sco.singlechoice_id = sc.id
//         WHERE sc.question_id IN (?)
//       `, [qIds])
//       : [[]];

//     const [multipleOptions] = qIds.length
//       ? await pool.query(`
//         SELECT mco.*, mc.question_id, mc.include_all_above
//         FROM multiplechoice_option mco
//         JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
//         WHERE mc.question_id IN (?)
//       `, [qIds])
//       : [[]];

//     const [rankingItems] = qIds.length
//       ? await pool.query(`
//         SELECT ri.*, ro.question_id
//         FROM ranking_item ri
//         JOIN rankingorder ro ON ri.ranking_id = ro.id
//         WHERE ro.question_id IN (?)
//       `, [qIds])
//       : [[]];

//     // =====================
//     // 5. BUILD FINAL RESULT
//     // =====================
//     const final = posts.map((post) => {
//       let data = null;

//       // -------- CONTENT --------
//       if (post.post_type === "content") {
//         data = contents.find((c) => c.post_id === post.id) || null;
//       }

//       // -------- CONFESSION --------
//       if (post.post_type === "confession") {
//         data = confessions.find((c) => c.post_id === post.id) || null;
//       }


//       // -------- QUESTION --------
//       if (post.post_type === "question") {
//         const q = questions.find((q) => q.post_id === post.id);

//         if (!q) return { ...post, data: null };

//         let extra = {};

//         switch (q.question_type) {
//           case "closedend":
//             extra = closed.find((c) => c.question_id === q.id) || {};
//             break;

//           case "range":
//             extra = ranges.find((r) => r.question_id === q.id) || {};
//             break;

//           case "singlechoice":
//             extra = {
//               choice: singleOptions.filter((o) => o.question_id === q.id),
//             };
//             break;

//           case "multiplechoice":
//             extra = {
//               include_all_above: multipleOptions.filter((o) => o.question_id === q.id)[0]?.include_all_above,
//               choices: multipleOptions.filter((o) => o.question_id === q.id),
//             };
//             break;

//           case "rankingorder":
//             extra = {
//               items: rankingItems.filter((i) => i.question_id === q.id),
//             };
//             break;

//           case "rating":
//             extra = ratings.find((r) => r.question_id === q.id) || {};
//             break;
//         }

//         data = { ...q, ...extra };
//       }

//       return { 
//         ...post, 
//         created_at: timeAgo(post.created_at), 
//         data };
//     });

//     // =====================
//     // 6. CACHE RESULT
//     // =====================
//     await cachePost.set(CACHE_KEY, JSON.stringify(final), { EX: 300 });

//     return res.status(200).json({
//       source: "db",
//       data: final,
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// ================================
// SAFE JSON PARSER
// ================================