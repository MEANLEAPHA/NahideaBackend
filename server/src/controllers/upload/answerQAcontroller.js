const pool = require("../../config/db");

const answerQA = async (req, res) => {
    try{
        const userId = req.user.userId;
        const { postId }= req.params.postId;
        const { questionId } = req.params.questionId;
        const { questionType } = req.params.questionType;
        const {
            is_anonymous, anonymous_name, anonymous_bg_color,

            // opened
            answerText,

            // closed
            answerValue,

            // rating
            ratingValue,

            // singlechoice
            optionId,

            // multiplechoice
            optionIds,

            // ranking
            rankingMap,

            // range
            rangeValue
        } = req.body;

        switch(questionType){
            case "openend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'openend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerText, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;
            case "closedend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'closedend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerValue, is_anonymous, anonymous_name, anonymous_bg_color]);
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
                    (question_id, post_id, user_id, question_type, singlechoice_option_id, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'singlechoice', ?, ?, ?, ?)`,
                [questionId, postId, userId, optionId, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "multiplechoice":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, multiplechoice_option_ids, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'multiplechoice', ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(optionIds), is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "ranking":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, ranking_positions, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'ranking', ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(rankingMap), is_anonymous, anonymous_name, anonymous_bg_color]);
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

module.exports = {answerQA};