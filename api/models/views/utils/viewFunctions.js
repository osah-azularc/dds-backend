import { Sequelize } from "sequelize";
import { mysqlSequelize } from "../../../../connections/seqDB.js";
import {
  createBillingPeriodDetailViewQuery,
  createBillingPeriodViewQuery,
} from "../queries/billingPeriodViews.js";
import { logger } from "../../../../config/winstonLogger.js";

// View names this function is allowed to drop. Keep in sync with the views
// created in this module — never interpolate an unvalidated name into SQL.
const DROPPABLE_VIEWS = new Set(["billing_period_view", "billing_details_view"]);

// Drop view if exists (MySQL doesn't support CREATE OR REPLACE)
export const dropViewIfExists = async (viewName) => {
  if (!DROPPABLE_VIEWS.has(viewName)) {
    logger.error(`Refusing to drop unrecognized view: ${viewName}`);
    return;
  }
  try {
    await mysqlSequelize.query(`DROP VIEW IF EXISTS ${viewName}`);
    logger.info(`View ${viewName} dropped if existed.`);
  } catch (error) {
    logger.error(`Unable to drop view ${viewName}:`, error);
  }
};

// create the view  by providing the view query
export const createView = async (createViewQuery) => {
  try {
    await mysqlSequelize.query(createViewQuery);
    logger.info("View created successfully.");
  } catch (error) {
    logger.error("Unable to create the view:", error);
  }
};

//check if the view exists by providing the view name and query
// to check if the checkIfViewExists() function

export const viewExistsQuery = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.views
      WHERE table_name = :viewName
    ) AS view_exists;
  `;

export const checkIfViewExists = async (viewName) => {
  try {
    const [results] = await mysqlSequelize.query(viewExistsQuery, {
      replacements: { viewName },
      type: Sequelize.QueryTypes.SELECT,
    });

    return results.view_exists;
  } catch (error) {
    logger.error("Error checking if view exists:", error);
    throw error;
  }
};

export const checkIfViewExistElseCreate = async () => {
  try {
    const billingDetailViewExists = await checkIfViewExists(
      "billing_details_view"
    );
    if (!billingDetailViewExists) {
      // Drop and recreate views (MySQL doesn't support CREATE OR REPLACE)
      await dropViewIfExists("billing_period_view"); // Drop dependent view first
      await dropViewIfExists("billing_details_view");
      await createView(createBillingPeriodDetailViewQuery);
      await createView(createBillingPeriodViewQuery);
    }
    const billingPeriodViewExists = await checkIfViewExists(
      "billing_period_view"
    );

    if (!billingPeriodViewExists) {
      await dropViewIfExists("billing_period_view");
      await createView(createBillingPeriodViewQuery);
    }
    return true;
  } catch (error) {
    logger.error("Error checking if view exists:", error);
    throw error;
  }
};
