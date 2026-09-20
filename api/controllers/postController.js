import { logger } from "../../config/winstonLogger.js";
export const getAllPosts = async (req, res) => {
  try {
    const posts = []; // Placeholder - Post model deleted
    return res.json(posts);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createPost = async (req, res) => {
  const { title, content } = req.body;
  try {
    // COMMENTED OUT - Post model deleted (PostgreSQL)
    // const newPost = await Post.create({ title, content });
    const newPost = null; // Placeholder - Post model deleted
    return res.json(newPost);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updatePost = async (req, res) => {
  try {
    const updatedPost = null; // Placeholder - Post model deleted
    return res.json(updatedPost);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deletePost = async (req, res) => {
  // COMMENTED OUT - Post model deleted (PostgreSQL)
  //const postId = req.params.id;
  try {
    return res.json({ message: "Post deleted successfully" });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const fetchSignedUpUsers = async (req, res) => {
  try {
    let tempUserList = [];

    // COMMENTED OUT - SocialUser, User models deleted (PostgreSQL)
    // const socialUsers = await SocialUser.findAll();
    // const applicationUsers = await User.findAll();
    const socialUsers = []; // Placeholder - SocialUser model deleted
    const applicationUsers = []; // Placeholder - User model deleted

    tempUserList = [...socialUsers, ...applicationUsers];

    const userList = tempUserList.map((obj) => {
      const {
        name,
        social_displayName,
        email,
        social_email,
        ip_address,
        social_ip_address,
        location,
        social_location,
      } = obj;
      return {
        name: name || social_displayName,
        email: email || social_email,
        ip: ip_address || social_ip_address,
        location: location || social_location,
      };
    });

    return res.status(200).json({
      userList,
      success: true,
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
  }
};

export const logoutUser = async (req, res) => {
  try {
    res.clearCookie("token", { path: "/", expires: new Date(0) });

    return res.json({
      message: "You have been logged out!",
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ error: "Log out failed" });
  }
};
