const pool = require("../../config/db");
const answerQA = async (req, res) => {
    try{
        const userId = req.user.userId;
        const { postId, questionId, questionType } = req.params;

        const {
            is_anonymous, anonymous_name, anonymous_bg_color,

            // opened
            answerText,

            // closed
            answerYesNo,

            // rating
            ratingValue,

            // singlechoice
            optionId,
            optionText,

            // multiplechoice
            optionIds,
            optionTexts,

            // ranking
            rankingIds,
            rankingTexts,

            // range
            rangeValue
        } = req.body;

        switch(questionType){
            case "openend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'openend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerText, is_anonymous || null, anonymous_name || null, anonymous_bg_color || null]);
                break;
            case "closedend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'closedend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerYesNo, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "rating":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, rating_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'rating', ?, ?, ?, ?)`,
                [questionId, postId, userId, ratingValue, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "singlechoice":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, singlechoice_option_id, singlechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'singlechoice', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, optionId, optionText, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "multiplechoice":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, multiplechoice_option_ids, multiplechoice_option_value,is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'multiplechoice', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(optionIds), JSON.stringify(optionTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "rankingorder":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, ranking_positions, ranking_position_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'rankingorder', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(rankingIds) ,JSON.stringify(rankingTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "range":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, range_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'range', ?, ?, ?, ?)`,
                [questionId, postId, userId, rangeValue, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;
        }
        res.status(200).json(
            {
                success: true,
                message: "Answer submitted successfully"
            }
        );

    }catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
}

const getQuestionById = async (req, res) => {
   try{
    const { questionId, questionType } = req.params;
    const [questions] = await pool.query(
      `SELECT title, question_related_to FROM question WHERE id = ?`,
      [questionId]
    );
    const question = questions[0];
    let data = {};
    switch(questionType){
      case 'openend' :
        data = {...question};
        break;
      case 'closedend' :
        data = {...question};
        break;
      case 'range':
        const [rangeRows] = await pool.query(
          `SELECT * FROM question_range WHERE question_id = ?`,
          [questionId]
        );
        const range = rangeRows[0] || null;
        if (!range) {
          console.warn("No range data found for question_id:", questionId);
        }

        data ={ ...question, ...range };
      break;
      case 'rating' :
        const [ratingRows] = await pool.query(
          `SELECT * FROM rating WHERE question_id = ?`,
          [questionId]
        );
        const rating = ratingRows[0] || null;
        
        data = { ...question, ...rating };
        break;
      case 'singlechoice' :
        const [singleRows] = await pool.query(`
          SELECT sco.*, sc.question_id
          FROM singlechoice_option sco
          JOIN singlechoice sc ON sco.singlechoice_id = sc.id
          WHERE sc.question_id = ?`, [questionId]);
        data = { ...question, choice: singleRows };
        break;
      case 'multiplechoice' :
        const [multiRows] = await pool.query(`
          SELECT mco.*, mc.question_id, mc.include_all_above
          FROM multiplechoice_option mco
          JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
          WHERE mc.question_id = ?`, [questionId]);
          const include_all_above = multiRows[0]?.include_all_above || 0;
        data = { ...question, include_all_above, choices: multiRows };
        break;
      case 'rankingorder' :
        const [rankRows] = await pool.query(`
          SELECT ri.*, ro.question_id
          FROM ranking_item ri
          JOIN rankingorder ro ON ri.ranking_id = ro.id
          WHERE ro.question_id = ?`, [questionId]);
        data = { ...question, items: rankRows };
        break;
    }

    res.status(200).json({
      source: "db",
      datas: data,
    });
   }catch(err){
    console.error(err);
    res.status(500).json({ message: "Server error" });
   }
}

module.exports = {answerQA, getQuestionById};