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