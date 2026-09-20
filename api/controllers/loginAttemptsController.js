import bcryptjs from "bcryptjs";
import {
  MESSAGES,
  FAILED_LOGIN_ATTEMPT_MAX_LIMIT,
} from "../constants/constant-messages.js";
import { activityLogger } from "../../config/winstonLogger.js";

const loginAttempts = async (req, res) => {
  const { email, password } = req.body;

  const userLoginData = await getUsersLoginData(email);
  let userId = userLoginData?.id || 0;
  let userIdEmail = "(User ID: " + userId + ", Email: " + email + ")";

  let failedLoginAttemptsCount = 0;
  let failedLoginAttemptsDatetime = null;
  let lockoutPeriod = 0;
  let isLocked = "0";

  let isUserAccountLocked = 0;
  if (
    userLoginData.failed_login_attempts_count ===
      FAILED_LOGIN_ATTEMPT_MAX_LIMIT &&
    userLoginData.is_locked === "1"
  ) {
    failedLoginAttemptsDatetime = new Date(
      userLoginData.failed_login_attempts_datetime,
    );
    const currentDate = new Date();
    const diff = Math.abs(currentDate - failedLoginAttemptsDatetime);
    const seconds = Math.floor(diff / 1000);

    const masterLockoutPeriodDuration = await getLockoutPeriodData(
      userLoginData.lockout_period,
    ); //get lockout period duration in seconds

    switch (userLoginData.lockout_period) {
      case 1:
        //check current date and time with failed_login_attempts_datetime and see if its more than 15 minutes[1st lockout period duration] then unlock the account
        isUserAccountLocked = seconds > masterLockoutPeriodDuration ? 0 : 1;
        break;
      case 2:
        //check current date and time with failed_login_attempts_datetime and see if its more than 6 hours[2nd lockout period duration] then unlock the account
        isUserAccountLocked = seconds > masterLockoutPeriodDuration ? 0 : 1;
        break;
      case 3:
        // after 3rd lockout period, account will be locked permanently, no recovery time and user has to connect with system administartor.
        isUserAccountLocked = 1;
        break;
      default:
        isUserAccountLocked = 0;
        break;
    }

    // If lockout period is over then unlock the account and let the user log In
    if (isUserAccountLocked == 0) {
      failedLoginAttemptsCount = 0;
      failedLoginAttemptsDatetime = null;
      lockoutPeriod = userLoginData.lockout_period; //do not reset lockout period count as it  is going to be use for future failed login attempts count (as right now we are only resetting the time so that user will login again after lockout period is over)
      isLocked = "0";
      await updateUserTable(
        email,
        failedLoginAttemptsCount,
        failedLoginAttemptsDatetime,
        lockoutPeriod,
        isLocked,
      );

      // Log unlock account activity
      activityLogger.error(
        "[AccountUnlocked] " +
          userIdEmail +
          " account was unlocked after " +
          masterLockoutPeriodDuration +
          " seconds of lockout period and now user is trying to logging In.",
      );
    } else {
      // if user's account is locked and he is trying to logging In within locking period (considering permanent lockout period as well) then check whether he performed valid login attempt or not, if yes then user will logged In successfully and unlock its account

      // check here all criteria for failed login attempts (As per updated AC)
      const validLoginAttemptResponseDuringLockoutPeriod =
        await checkValidLoginAttempt(password, userLoginData);

      if (validLoginAttemptResponseDuringLockoutPeriod?.isValidLoginAttempt) {
        failedLoginAttemptsCount = 0;
        failedLoginAttemptsDatetime = null;
        lockoutPeriod = 0;
        isLocked = "0";
        await updateUserTable(
          email,
          failedLoginAttemptsCount,
          failedLoginAttemptsDatetime,
          lockoutPeriod,
          isLocked,
        );

        // Log unlock account activity as user successfully logged in during lockout period
        activityLogger.error(
          "[AccountUnlocked] " +
            userIdEmail +
            " account is unlocked due to successful login attempt during lockout period: " +
            userLoginData.lockout_period,
        );

        return {
          message: "Login successful!",
          success: true,
          action: "login_successful",
        };
      } else {
        // Log failed login attempt during lockout period even though account is locked
        activityLogger.error(
          "[LoginAttemptFail] [" +
            validLoginAttemptResponseDuringLockoutPeriod?.reason +
            "] " +
            userIdEmail +
            " locked account, Fails to log In again during lockout period: " +
            userLoginData.lockout_period,
        );

        return {
          message:
            "Reach out to your system administrator if you need to reset your password",
          success: false,
          action: MESSAGES.ACCOUNT_LOCKED,
        };
      }
    }
  }

  // check here all criteria for failed login attempts (As per updated AC)
  const validLoginAttemptResponse = await checkValidLoginAttempt(
    password,
    userLoginData,
  );

  if (!validLoginAttemptResponse?.isValidLoginAttempt) {
    const getLatestUsersData = await getUsersLoginData(email);
    failedLoginAttemptsCount =
      getLatestUsersData.failed_login_attempts_count + 1;
    failedLoginAttemptsDatetime = new Date();

    if (failedLoginAttemptsCount == FAILED_LOGIN_ATTEMPT_MAX_LIMIT) {
      lockoutPeriod = getLatestUsersData.lockout_period + 1;
      isLocked = "1";
      await updateUserTable(
        email,
        failedLoginAttemptsCount,
        failedLoginAttemptsDatetime,
        lockoutPeriod,
        isLocked,
      );

      // Log the failed login attempt also lock the account
      activityLogger.error(
        "[LoginAttemptFail] [" +
          validLoginAttemptResponse?.reason +
          "] " +
          userIdEmail +
          " Fails to log In : " +
          failedLoginAttemptsCount +
          " time(s). Previous lockout period was: " +
          getLatestUsersData.lockout_period,
      );
      activityLogger.error(
        "[AccountLocked] " +
          userIdEmail +
          " account is locked due to " +
          failedLoginAttemptsCount +
          " Failed login attempts. Now user is in lockout period: " +
          lockoutPeriod,
      );

      return {
        message:
          "Reach out to your system administrator if you need to reset your password",
        success: false,
        action: MESSAGES.ACCOUNT_LOCKED,
      };
    } else {
      lockoutPeriod = getLatestUsersData.lockout_period;
      isLocked = getLatestUsersData.is_locked;
      await updateUserTable(
        email,
        failedLoginAttemptsCount,
        failedLoginAttemptsDatetime,
        lockoutPeriod,
        isLocked,
      );

      // Log the failed login attempt
      activityLogger.error(
        "[LoginAttemptFail] [" +
          validLoginAttemptResponse?.reason +
          "] " +
          userIdEmail +
          " Fails to log In: " +
          failedLoginAttemptsCount +
          " time(s). Previous lockout period was: " +
          lockoutPeriod,
      );
    }

    return {
      message: "Invalid credentials!",
      success: false,
      action: validLoginAttemptResponse?.reason,
    };
  } else {
    failedLoginAttemptsCount = 0;
    failedLoginAttemptsDatetime = null;
    lockoutPeriod = 0;
    isLocked = "0";
    await updateUserTable(
      email,
      failedLoginAttemptsCount,
      failedLoginAttemptsDatetime,
      lockoutPeriod,
      isLocked,
    );

    // 1. user was tried < 5 times login attempt and now on 5th attempt he successfully logged in
    // 2. user tried 5 times and account was locked and now after/during lockout period he successfully logged in
    if (
      (userLoginData.failed_login_attempts_count >= 1 &&
        userLoginData.failed_login_attempts_count <
          FAILED_LOGIN_ATTEMPT_MAX_LIMIT) ||
      userLoginData.lockout_period >= 1
    ) {
      // Log successful login attempt after failed login attempts
      activityLogger.error(
        "[LoginAttemptSuccess] " +
          userIdEmail +
          " successfully logged in after " +
          userLoginData.failed_login_attempts_count +
          " Failed login attempts and user was in lockout period: " +
          userLoginData.lockout_period,
      );
    }

    return {
      message: "Login successful!",
      success: true,
      action: "login_successful",
    };
  }
};

const getUsersLoginData = async (email) => {
  const latestUserData = await User.findOne({
    where: {
      email: email,
    },
    attributes: [
      "id",
      "email",
      "password",
      "failed_login_attempts_count",
      "failed_login_attempts_datetime",
      "lockout_period",
      "is_locked",
      "is_active",
    ],
  });
  return latestUserData;
};

const updateUserTable = async (
  email,
  failedLoginAttemptsCount,
  failedLoginAttemptsDatetime,
  lockoutPeriod,
  isLocked,
) => {
  const updatedUserData = await User.update(
    {
      failed_login_attempts_count: failedLoginAttemptsCount,
      failed_login_attempts_datetime: failedLoginAttemptsDatetime,
      lockout_period: lockoutPeriod,
      is_locked: isLocked,
    },
    {
      where: {
        email: email,
      },
    },
  );
  return updatedUserData;
};

const getLockoutPeriodData = async (lockoutPeriodCount) => {
  const lockoutPeriodData = await LockoutPeriodMaster.findOne({
    where: {
      lockout_period_count: lockoutPeriodCount,
    },
    attributes: ["lockout_period"],
  });

  return lockoutPeriodData ? lockoutPeriodData.lockout_period : 0;
};

const checkValidLoginAttempt = async (password, userLoginData) => {
  let isValidLoginResponse = { isValidLoginAttempt: true, reason: "" };

  //First check if user is active
  if (userLoginData && userLoginData?.is_active !== true) {
    isValidLoginResponse = {
      isValidLoginAttempt: false,
      reason: MESSAGES.USER_NOT_ACTIVE,
    };
    return isValidLoginResponse;
  }

  //Secondly check if user has provided correct password
  if (userLoginData?.password && userLoginData?.password.length > 0) {
    const validPassword = await bcryptjs.compare(
      password,
      userLoginData?.password,
    );
    if (!validPassword) {
      isValidLoginResponse = {
        isValidLoginAttempt: false,
        reason: MESSAGES.INVALID_PASSWORD,
      };
      return isValidLoginResponse;
    }
  } else {
    isValidLoginResponse = {
      isValidLoginAttempt: false,
      reason: MESSAGES.INVALID_PASSWORD,
    };
    return isValidLoginResponse;
  }

  return isValidLoginResponse;
};

export { loginAttempts };
