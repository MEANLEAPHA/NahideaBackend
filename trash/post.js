      if(post_type === "content"){
        try{

          let mediaUrl = [];
          let mediaType = [];

          if (req.files && req.files.length > 0) {

              const uploadPromises = req.files.map(async (contentFile) => {
                  const fileName = Date.now() + "-" + contentFile.originalname;
                  await uploadToHostinger(contentFile.path, fileName);

                  const fileUrl = `${ftpuRL}/img/content/${fileName}`;
                  const type = contentFile.mimetype.startsWith("image")
                      ? "image"
                      : contentFile.mimetype.startsWith("video")
                      ? "video"
                      : "other";

                  return { url: fileUrl, type };
              });

              const results = await Promise.all(uploadPromises);
              mediaUrl = results.map(r => r.url);
              mediaType = results.map(r => r.type);
          };

            await pool.query(
              `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
                    VALUES(?, ?, ?, ?, ?, ?)`,
                    [userId, postId, content_type, content_title, JSON.stringify(mediaType), JSON.stringify(mediaUrl), isAnonymous]
            );

        }
        catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "contentController(content post)", error.stack);
          return res.status(500).json({
            message: "Sorry, something's wrong",
          });
        }
      };

       if(post_type === "confession"){
          try{

            let mediaUrl;
            let mediaType;
            if (req.files && req.files.length > 0) {
                const confessionFile = req.files[0];
                const fileName = Date.now() + "-" + confessionFile.originalname;
                await uploadToHostinger(confessionFile.path, fileName);

                mediaUrl = `${ftpuRL}/img/confession/${fileName}`;
                mediaType = confessionFile.mimetype.startsWith("image")
                    ? "image"
                    : confessionFile.mimetype.startsWith("video")
                    ? "video" 
                    : "other";
            };
            const media_url = mediaUrl || null;
            const media_type = mediaType || null;

            await pool.query(
                `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous) 
                VALUE(?, ?, ?, ?, ?, ?)`,
                [userId, postId, confession_type, confession_title, media_type, media_url, isAnonymous]
              );
          }
            catch(error){
              console.error(error.message);
              await Errors(error.message, error.code, "contentController(confession post)", error.stack);
              return res.status(500).json({
                message: "Sorry, something's wrong",
              });
            }
        };

      if(post_type === "question"){
        try{
            const [questionResult] = await db.query(
                "INSERT INTO question (post_id, question_type, title, question_related_to) VALUES (?, ?, ?, ?)",
                [postId, question_type, question_title, question_related_to]
            );
            const questionId = questionResult.insertId;
            switch (question_type) {
              case "openend":

                let openendMediaUrl;
                if (req.files && req.files.length > 0) {
                  const openEndFileValue = req.files[0];
                  const fileName = Date.now() + "-" + openEndFileValue.originalname;
                  await uploadToHostinger(openEndFileValue.path, fileName);
                }

                openendMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;

                await db.query(
                  "INSERT INTO question_openend (question_id, media_url) VALUES (?, ?)",
                  [questionId, openendMediaUrl]
                );

                break;

              case "closedend":

                let yesClosedendMediaUrl;
                let noClosedendMediaUrl;

                if (req.files && req.files.length > 0) {
                  const yesFile = req.files[0];
                  const noFile  = req.files[0];

                  const yesFileName = Date.now() + "-" + yesFile.originalname;
                  const noFileName = Date.now() + "-" + noFile.originalname;

                  await Promise.all([
                      uploadToHostinger(yesFile.path, yesFileName),
                      uploadToHostinger(noFile.path, noFileName)
                  ]);
                
                }

                yesClosedendMediaUrl = `${ftpuRL}/img/question/${question_type}/${yesFileName}`;
                noClosedendMediaUrl = `${ftpuRL}/img/question/${question_type}/${noFileName}`;

                await db.query(
                  "INSERT INTO question_closedend (question_id, yes_title, no_title, yes_media_url, no_media_url) VALUES (?, ?, ?, ?, ?)",
                  [questionId, req.body.yesTitle, req.body.noTitle, yesClosedendMediaUrl, noClosedendMediaUrl]
                );

                break;

              case "range":
                let rangeFileMediaUrl;
                if (req.files && req.files.length > 0) {
                  const rangeFile = req.files[0];
                  const fileName = Date.now() + "-" + rangeFile.originalname;
                  await uploadToHostinger(rangeFile.path, fileName);
                }

                rangeFileMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;
                
                await db.query(
                  "INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value, media_url) VALUES (?, ?, ?, ?, ?, ?)",
                  [questionId, req.body.min, req.body.max, req.body.step, req.body.rangeValue, rangeFileMediaUrl]
                );
                break;

              case "singlechoice":

                let singleChoiceFileMediaUrl;
                if (req.files && req.files.length > 0) {
                  const singleChoiceFile = req.files[0];
                  const fileName = Date.now() + "-" + singleChoiceFile.originalname;
                  await uploadToHostinger(singleChoiceFile.path, fileName);
                }

                singleChoiceFileMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;

                const [sc] = await db.query(
                  "INSERT INTO question_singlechoice (question_id, media_url) VALUES (?, ?)",
                  [questionId, singleChoiceFileMediaUrl]
                );
                const singleChoiceId = sc.insertId;
                (req.body["choices[]"] || []).forEach(async (choice) => {
                  await db.query(
                    "INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)",
                    [singleChoiceId, choice]
                  );
                });
                break;

              case "multiplechoice":

                let multipleChoiceFileMediaUrl;
                if (req.files && req.files.length > 0) {
                  const multipleChoiceFile = req.files[0];
                  const fileName = Date.now() + "-" + multipleChoiceFile.originalname;
                  await uploadToHostinger(multipleChoiceFile.path, fileName);
                }

                multipleChoiceFileMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;

                const [mc] = await db.query(
                  "INSERT INTO question_multiplechoice (question_id, include_all_above, media_url) VALUES (?, ?, ?)",
                  [questionId, req.body.include_all_above, multipleChoiceFileMediaUrl]
                );
                const multipleChoiceId = mc.insertId;
                (req.body["choices[]"] || []).forEach(async (choice) => {
                  await db.query(
                    "INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)",
                    [multipleChoiceId, choice]
                  );
                });
                break;

              case "rankingorder":

              let rankingOrderFileMediaUrl;
                if (req.files && req.files.length > 0) {
                  const multipleChoiceFile = req.files[0];
                  const fileName = Date.now() + "-" + multipleChoiceFile.originalname;
                  await uploadToHostinger(multipleChoiceFile.path, fileName);
                }

                rankingOrderFileMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;

                const [ro] = await db.query(
                  "INSERT INTO question_rankingorder (question_id, media_url) VALUES (?, ?)",
                  [questionId, rankingOrderFileMediaUrl]
                );
                const rankingId = ro.insertId;
                Object.entries(req.body)
                  .filter(([key]) => key.startsWith("ranking["))
                  .forEach(async ([key, value]) => {
                    const position = parseInt(key.match(/\[(\d+)\]/)[1], 10);
                    await db.query(
                      "INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)",
                      [rankingId, position, value]
                    );
                  });
                break;

              case "rating":

                let ratingFileMediaUrl;
                if (req.files && req.files.length > 0) {
                  const ratingFile = req.files[0];
                  const fileName = Date.now() + "-" + ratingFile.originalname;
                  await uploadToHostinger(ratingFile.path, fileName);
                }

                ratingFileMediaUrl = `${ftpuRL}/img/question/${question_type}/${fileName}`;

                await db.query(
                  "INSERT INTO question_rating (question_id, rating_icon_id, media_url) VALUES (?, ?, ?)",
                  [questionId, req.body.rating_icon_id, ratingFileMediaUrl]
                );
                break;

              default:
                return res.status(400).json({ error: "Invalid question type" });
            }
        }
        catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "contentController(question post)", error.stack);
          return res.status(500).json({
            message: "Sorry, something's wrong"});
        }
      };