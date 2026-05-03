const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger, convertAndUpload } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();

// Redis Cache
const {redisClient} = require("../../config/redisClient");

const createPost = async (req, res) => {
  try{
      const { 
              // post based
              post_type, tags = [], isAnonymous,

                // content
                content_title, content_type,text_body,

                // confession
                confession_title, confession_type,

                // question 
                question_type, question_title, question_related_to,

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
              `INSERT INTO content(user_id, post_id, type, title, text_body, media_type, media_url)
                    VALUES(?, ?, ?, ?, ?, ?, ?)`,
                    [userId, postId, content_type, content_title, text_body,JSON.stringify(mediaType), JSON.stringify(mediaUrl)]
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
                `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url) 
                VALUE(?, ?, ?, ?, ?, ?)`,
                [userId, postId, confession_type, confession_title, media_type, media_url]
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
                "INSERT INTO question(post_id, question_type, title, media_url, question_related_to) VALUES (?, ?, ?, ?, ?)",
                [postId, question_type, question_title, media_url, question_related_to]
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

                  await pool.query(
                    "INSERT INTO closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)",
                    [questionId, req.body.yesTitle, req.body.noTitle]
                  );
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
    
    const postTypeRes = post_type.slice(0, 1).toUpperCase() + post_type.slice(1);
    res.status(200).json({ message: `${postTypeRes} uploaded successfully`, postId });


    // clear old cache
    await redisClient.del("posts:page:1");

    }
    catch(error){
      console.error(error.message);
      await Errors(error.message, error.code, "post-controller", error.stack);
      return res.status(500).json({ message: "Sorry, Server Error" });
    }
}; 

const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;
  
    const CACHE_KEY = `posts:page:${page}`;

    // =====================
    // 1. CHECK CACHE FIRST
    // =====================
    const cached = await redisClient.get(CACHE_KEY);

    if (cached) {
      console.log("CACHE HIT");
      return res.status(200).json({
        source: "cache",
        data: JSON.parse(cached),
      });
    }

   

    // =====================
    // 2. GET BASE POSTS
    // =====================
     const [posts] = await pool.query(`
      SELECT
        p.id, p.post_type, p.is_anonymous, p.anonymous_name, p.anonymous_bg_color, p.likes_count, p.comments_count, p.views_count,
        p.created_at, p.status,
        u.username,
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
      return res.status(200).json({ source: "db", data: [] });
    }

    // =====================
    // 3. SPLIT IDS BY TYPE
    // =====================
    const contentIds = [];
    const confessionIds = [];

    const questionIds = [];

    posts.forEach((p) => {

      if (p.post_type === "content") contentIds.push(p.id);
      if (p.post_type === "confession") confessionIds.push(p.id);
      if (p.post_type === "question") questionIds.push(p.id);

    });

    // =====================
    // 4. FETCH RELATED DATA
    // =====================
    const [contents] = contentIds.length
      ? await pool.query(`SELECT * FROM content WHERE post_id IN (?)`, [contentIds])
      : [[]];

    const [confessions] = confessionIds.length
      ? await pool.query(`SELECT * FROM confession WHERE post_id IN (?)`, [confessionIds])
      : [[]];

    const [questions] = questionIds.length
      ? await pool.query(`SELECT * FROM question WHERE post_id IN (?)`, [questionIds])
      : [[]];

    // get question ids
    const qIds = questions.map((q) => q.id);

    const [closed] = qIds.length
      ? await pool.query(`SELECT * FROM closedend WHERE question_id IN (?)`, [qIds])
      : [[]];

    const [ranges] = qIds.length
      ? await pool.query(`SELECT * FROM question_range WHERE question_id IN (?)`, [qIds])
      : [[]];

    const [ratings] = qIds.length
      ? await pool.query(`SELECT * FROM rating WHERE question_id IN (?)`, [qIds])
      : [[]];

    const [singleOptions] = qIds.length
      ? await pool.query(`
        SELECT sco.*, sc.question_id
        FROM singlechoice_option sco
        JOIN singlechoice sc ON sco.singlechoice_id = sc.id
        WHERE sc.question_id IN (?)
      `, [qIds])
      : [[]];

    const [multipleOptions] = qIds.length
      ? await pool.query(`
        SELECT mco.*, mc.question_id
        FROM multiplechoice_option mco
        JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
        WHERE mc.question_id IN (?)
      `, [qIds])
      : [[]];

    const [rankingItems] = qIds.length
      ? await pool.query(`
        SELECT ri.*, ro.question_id
        FROM ranking_item ri
        JOIN rankingorder ro ON ri.ranking_id = ro.id
        WHERE ro.question_id IN (?)
      `, [qIds])
      : [[]];

    // =====================
    // 5. BUILD FINAL RESULT
    // =====================
    const final = posts.map((post) => {
      let data = null;

      // -------- CONTENT --------
      if (post.post_type === "content") {
        data = contents.find((c) => c.post_id === post.id) || null;
      }

      // -------- CONFESSION --------
      if (post.post_type === "confession") {
        data = confessions.find((c) => c.post_id === post.id) || null;
      }


      // -------- QUESTION --------
      if (post.post_type === "question") {
        const q = questions.find((q) => q.post_id === post.id);

        if (!q) return { ...post, data: null };

        let extra = {};

        switch (q.question_type) {
          case "closedend":
            extra = closed.find((c) => c.question_id === q.id) || {};
            break;

          case "range":
            extra = ranges.find((r) => r.question_id === q.id) || {};
            break;

          case "singlechoice":
            extra = {
              choices: singleOptions.filter((o) => o.question_id === q.id),
            };
            break;

          case "multiplechoice":
            extra = {
              choices: multipleOptions.filter((o) => o.question_id === q.id),
            };
            break;

          case "rankingorder":
            extra = {
              items: rankingItems.filter((i) => i.question_id === q.id),
            };
            break;

          case "rating":
            extra = ratings.find((r) => r.question_id === q.id) || {};
            break;
        }

        data = { ...q, ...extra };
      }

      return { 
        ...post, 
        created_at: timeAgo(post.created_at), 
        data };
    });

    // =====================
    // 6. CACHE RESULT
    // =====================
    await redisClient.set(CACHE_KEY, JSON.stringify(final), { EX: 300 });

    return res.status(200).json({
      source: "db",
      data: final,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const getPostsById = async(req, res)=>{

  try{
    const {id} = req.params;
    const CACHE_KEY = `posts:id:${id}`;

    const cached = await redisClient.get(CACHE_KEY);

    if (cached) {
      console.log("CACHE HIT");
      return res.status(200).json({
        source: "cache",
        data: JSON.parse(cached),
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
    const final = { ...post, ...data };
     
    await redisClient.set(CACHE_KEY, JSON.stringify(final), { EX: 300 });

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


const markSolved = async (req, res) => {
  const { id } = req.params;

  await pool.query(
    "UPDATE posts SET status='solved' WHERE id=? AND user_id=?",
    [id, req.user.id]
  );

  res.json({ message: "Marked as solved" });
};

module.exports = {

  createPost,
  markSolved,
  upload,
  getAllPosts,
  getPostsById

};