import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import PartyType from "./partyTypeModel.js";
import { logger } from "../../../config/winstonLogger.js";

const PartyDetailsMaster = mysqlSequelize.define(
  "party_details_masters",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id",
    },

    party_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "party_type",
      references: {
        model: PartyType,
        key: "id",
      },
    },

    title: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "title",
    },

    firstname: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "firstname",
    },

    lastname: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "lastname",
    },

    address1: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "address1",
    },

    address2: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "address2",
    },

    city: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "city",
    },

    state: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "state",
    },

    zip: {
      type: DataTypes.STRING(15),
      allowNull: false,
      field: "zip",
    },

    phone: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "phone",
    },

    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "email",
    },

    fax: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "fax",
    },

    attorney_bar: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "attorney_bar",
    },

    badge_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "badge_no",
    },

    company: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "company",
    },

    is_delete: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "0",
      field: "is_delete",
    },

    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },

    created_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },

    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "updated_by",
    },

    updated_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "updated_date",
    },
  },
  {
    tableName: "party_details_masters",
    timestamps: true,
    freezeTableName: true,
  },
);

PartyDetailsMaster.sync({ alter: false })
  .then(() => {
    logger.info("PartyDetailsMaster table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing PartyDetailsMaster table:", error);
  });

export default PartyDetailsMaster;
