

const Joi = require("joi");

// Validation schema
const postSchema = Joi.object({
  post_type: Joi.string().valid("content", "confession", "question", "repost").required(),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  isAnonymous: Joi.boolean().default(false).optional(), 

  content_title: Joi.string().optional(),
  content_type: Joi.string().optional(),

  confession_title: Joi.string().optional(),
  confession_type: Joi.string().optional(),

  question_type: Joi.string().optional(),
  question_title: Joi.string().optional(),
  question_related_to: Joi.string().optional(),

    yesTitle: Joi.string().optional(),
    noTitle: Joi.string().optional(),
    rangeMin: Joi.number().optional(),
    rangeMax: Joi.number().optional(),
    rangeStep: Joi.number().optional(),
    defaultRangeValue: Joi.number().optional(),
    choices: Joi.array().items(Joi.string()).optional(),
    include_all_above: Joi.number().valid(0, 1).default(0).optional(),
    ranking: Joi.array().items(Joi.string()).optional(),
    rating_icon_id: Joi.number().optional(),

  repost_title: Joi.string().optional()
});

const createPost = async (req, res) => {
  const { error, value } = postSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ code: 400, message: error.details[0].message });
  }

  const { post_type, tags, isAnonymous } = value;
  const userId = req.user.userId;

  try {
    // Rate limit: max 5 posts in 10 minutes
    const [attempts] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM post_attempts 
       WHERE user_id = ? AND timestamp > NOW() - INTERVAL 10 MINUTE`,
      [userId]
    );
    if (attempts[0].count >= 5) {
      return res.status(429).json({ code: 429, message: "Please wait 10 minutes before posting again." });
    }

    // Start transaction
    await pool.query("START TRANSACTION");

    // Insert base post
    const [result] = await pool.query(
      "INSERT INTO posts (user_id, post_type, is_anonymous) VALUES (?, ?, ?)",
      [userId, post_type, isAnonymous]
    );
    const postId = result.insertId;

    // Normalize & store tags
    if (tags.length > 0) {
      await Promise.all(tags.map(async (rawTag) => {
        const name = rawTag.trim().toLowerCase();
        const label = rawTag.trim();
        const [rows] = await pool.query("SELECT id FROM tags WHERE name = ?", [name]);
        let tagId = rows.length ? rows[0].id : (await pool.query(
          "INSERT INTO tags (name, label) VALUES (?, ?)", [name, label]
        ))[0].insertId;
        await pool.query("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tagId]);
      }));
    }

    // Handlers
    const handlers = {
      content: async () => {
        const files = req.files?.contentFile || [];
        const results = await Promise.all(files.map(f => convertAndUpload(f, "content")));
        const urls = results.map(r => r.url);
        const types = results.map(r => r.type);
        await pool.query(
          `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, value.content_type, value.content_title,
           JSON.stringify(types), JSON.stringify(urls), isAnonymous]
        );
      },
      confession: async () => {
        const file = req.files?.confessionFile?.[0];
        const result = file ? await convertAndUpload(file, "confession") : {};
        await pool.query(
          `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, value.confession_type, value.confession_title,
           result.type || null, result.url || null, isAnonymous]
        );
      },
      question: async () => {
        const file = req.files?.questionFile?.[0];
        const result = file ? await convertAndUpload(file, "question") : {};
        const [qRes] = await pool.query(
          "INSERT INTO question(post_id, question_type, title, media_url, question_related_to) VALUES (?, ?, ?, ?, ?)",
          [postId, value.question_type, value.question_title, result.url || null, value.question_related_to]
        );
        const qId = qRes.insertId;

        switch (value.question_type) {
          case "openend": await pool.query("INSERT INTO openend (question_id) VALUES (?)", [qId]); break;
          case "closedend": await pool.query("INSERT INTO closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)", [qId, value.yesTitle, value.noTitle]); break;
          case "range": await pool.query("INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES (?, ?, ?, ?, ?)", [qId, value.rangeMin, value.rangeMax, value.rangeStep, value.defaultRangeValue]); break;
          case "singlechoice": {
            const [sc] = await pool.query("INSERT INTO singlechoice (question_id) VALUES (?)", [qId]);
            await Promise.all((value.choices || []).map(c => pool.query("INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)", [sc.insertId, c])));
            break;
          }
          case "multiplechoice": {
            const [mc] = await pool.query("INSERT INTO multiplechoice (question_id, include_all_above) VALUES (?, ?)", [qId, value.include_all_above]);
            await Promise.all((value.choices || []).map(c => pool.query("INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)", [mc.insertId, c])));
            break;
          }
          case "rankingorder": {
            const [ro] = await pool.query("INSERT INTO rankingorder (question_id) VALUES (?)", [qId]);
            await Promise.all((value.ranking || []).map((val, idx) => pool.query("INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)", [ro.insertId, idx, val])));
            break;
          }
          case "rating": await pool.query("INSERT INTO rating (question_id, rating_icon_id) VALUES (?, ?)", [qId, value.rating_icon_id]); break;
          default: return res.status(400).json({ code: 400, message: "Invalid question type" });
        }
      },
      repost: async () => {
        await pool.query("INSERT INTO repost(post_id, title) VALUES (?, ?)", [postId, value.repost_title]);
      }
    };

    if (!handlers[post_type]) {
      return res.status(400).json({ code: 400, message: "Invalid post type" });
    }
    await handlers[post_type]();

    // Record attempt
    await pool.query("INSERT INTO post_attempts (user_id, timestamp) VALUES (?, NOW())", [userId]);

    // Commit transaction
    await pool.query("COMMIT");

    return res.status(201).json({message: "Post created successfully", postId });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error.message);
    await Errors(error.message, error.code, "post-controller", error.stack);
    return res.status(500).json({ code: 500, message: "Internal Server Error" });
  }
};

const createPost = async (req, res) => {
  try{

      const { 
              // post based
              post_type, tags = [], isAnonymous,

                // content
                content_title, content_type,

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

      const [result] = await pool.query(
        "INSERT INTO posts (user_id, post_type, is_anonymous) VALUES (?, ?, ?)",
        [userId, post_type, isAnonymous]
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

      // Storing posts by post_type
      switch(post_type){

        case "content" :

          try{

            let mediaUrl = [];
            let mediaType = [];
            const contentFiles = req.files?.contentFile || [];
            const uploadPromises = contentFiles.map(f => convertAndUpload(f, "content"));
            const results = await Promise.all(uploadPromises);
            mediaUrl = results.map(r => r.url);
            mediaType = results.map(r => r.type);

            await pool.query(
              `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
                    VALUES(?, ?, ?, ?, ?, ?, ?)`,
                    [userId, postId, content_type, content_title, JSON.stringify(mediaType), JSON.stringify(mediaUrl), isAnonymous]
            );

          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "contentController(content post)", error.stack);
            return res.status(505).json({
              message: "Sorry, Server Error",
            });
          }
          break;

        case "confession":

          try{

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
                `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous) 
                VALUE(?, ?, ?, ?, ?, ?, ?)`,
                [userId, postId, confession_type, confession_title, media_type, media_url, isAnonymous]
              );
            
            return res.status(200).json({
              message: "Confession uploaded successfully",
            });

          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "contentController(confession post)", error.stack);
            return res.status(505).json({
              message: "Sorry, Server Error",
            });
          }
          break;
        
        case "question":
          try{

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

                  await pool.query(
                    "INSERT INTO openend (question_id) VALUES (?)",
                    [questionId]
                  );
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
                }
            catch(error){
              console.error(error.message);
              await Errors(error.message, error.code, "contentController(question post)", error.stack);
              return res.status(505).json({
                message: "Sorry, Server Error"}
              );
            }
            break;

        case "repost" :
          try{
            await pool.query(
              `INSERT INTO repost(post_id, title) VALUE(?,?)`,
              [postId, repost_title]
            )
          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "repostController(repost post)", error.stack);
            return res.status(505).json({
              message: "Sorry, Server Error"
            });
          }
          break;
        default :
         return res.status(400).json({error: "Invalid post type"});

      };
    
      res.status(200).json({ message: "Post created", postId });

      }
      catch(error){
        console.error(error.message);
        await Errors(error.message, error.code, "post-controller", error.stack);
        return res.status(500).json({ message: "Sorry, Server Error" });
      }
};
