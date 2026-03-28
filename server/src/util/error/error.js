const pool = require("../../config/db");
const Errors = async ({
  message,
  code = "UNKNOWN",
  location = "UNKNOWN",
  stack = null
}) => {
  try {

   
    console.error({
      message,
      code,
      location,
      stack,

    });

    await pool.query(
      `INSERT INTO error (message, code, location, stack, error_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        message,
        code,
        location,
        stack
      ]
    );

  } catch (loggingError) {


    console.error("Error while storing error log:", loggingError.message);

  }
};

module.exports = { Errors };
