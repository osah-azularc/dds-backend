import States from "../models/States.js";
import { logger } from "../../config/winstonLogger.js";

export const getState = async (req, res) => {
  try {
    const { stateId } = req.params;
    const states = await States.find({
      where: {
        idStates: stateId,
      },
    }).toArray();

    return res.status(200).json({ success: true, data: states, status: 200 });
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", data: [], status: 500 });
  }
};

export const getAllStates = async (req, res) => {
  try {
    const states = await States.findAll({
      order: [["state", "ASC"]],
    });
    return res.status(200).json({ success: true, data: states, status: 200 });
  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", data: [], status: 500 });
  }
};
