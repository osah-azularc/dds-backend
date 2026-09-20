export const createBillingPeriodDetailViewQuery = `CREATE VIEW billing_details_view AS


    (SELECT id,billing_date,owner_name,billing_type,CAST(category AS CHAR(255)) AS category,description,rejection_reason,
  receipt,CAST(GROUP_CONCAT(agency_name SEPARATOR ',') AS CHAR(255)) AS agency_name,CAST(billable_duration AS TIME) AS billable_duration,
  CAST(non_billable_duration AS TIME) AS non_billable_duration, CAST(original_working_time AS TIME) AS original_working_time,
  CAST(rounded_up_time AS TIME) AS rounded_up_time,
  expense_count,billable_count,non_billable_count,billable_amount,status
FROM
(SELECT ex_a.expense_id AS id, expense_date AS billing_date,
    expense_owner AS owner_name, expense_type AS billing_type, 'Expense' AS category,
    expense_description As description,
    expense_receipt As receipt,
	rejection_feedback AS rejection_reason,
	ag.name AS agency_name,
    NULL AS billable_duration, NULL AS non_billable_duration,
    NULL AS original_working_time,
    NULL AS rounded_up_time,
	1 AS expense_count,
	0 AS billable_count,
	0 AS non_billable_count,
    expense_amount AS billable_amount, (
   SELECT st.status_name from Status_table st WHERE st.id = ex.status_id ) AS status
    From expense_agency ex_a LEFT JOIN agencies ag ON ag.id = ex_a.agency_id
    RIGHT JOIN Expenses ex ON ex_a.expense_id = ex.expense_id
    WHERE ex.is_deleted = false) AS multi_agency_expense
   GROUP BY id,billing_date,owner_name,billing_type,category,description,
  receipt,billable_duration,rejection_reason,
  non_billable_duration,original_working_time,rounded_up_time,
  expense_count,billable_count,non_billable_count,billable_amount,status
   ORDER BY id,billing_date,owner_name,billing_type,category,description,
  receipt,billable_duration,
  non_billable_duration,original_working_time,rounded_up_time,
  expense_count,billable_count,non_billable_count,billable_amount,status
)
    UNION ALL
    (
	SELECT id,billing_date,owner_name,billing_type,CAST(category AS CHAR(255)) AS category,description,rejection_reason,
  receipt,CAST(GROUP_CONCAT(agency_name SEPARATOR ',') AS CHAR(255)) AS agency_name,CAST(billable_duration AS TIME) AS billable_duration,
  CAST(non_billable_duration AS TIME) AS non_billable_duration, CAST(original_working_time AS TIME) AS original_working_time,
  CAST(rounded_up_time AS TIME) AS rounded_up_time,

  expense_count,billable_count,non_billable_count,billable_amount,status
	From
	(SELECT ta.timeentry_id AS id,
	        time_tracking_date_entry AS billing_date,
			CAST(CONCAT(us.first_name,' ',us.last_name) AS CHAR(255)) AS owner_name,
             ts.task_name AS billing_type,
            'Time' AS category,
			ta.rejection_feedback AS rejection_reason ,
            description As description,
            NULL As receipt,
            ag.name AS agency_name,

	CASE WHEN ts.task_billable = '1' THEN CAST(ta.rounded_up_time AS TIME)
	ELSE NULL END AS billable_duration,
	CASE WHEN ts.task_billable = '0' THEN CAST(ta.rounded_up_time AS TIME)
	ELSE  NULL END AS non_billable_duration,

	CAST(ta.original_working_time AS TIME) AS original_working_time,
	CAST(ta.rounded_up_time AS TIME) AS rounded_up_time,

	0 AS expense_count,

    CASE WHEN ts.task_billable = '1' THEN 1
	ELSE 0 END AS billable_count,
	CASE WHEN ts.task_billable = '0' THEN 1
	ELSE 0 END AS non_billable_count,

	CASE WHEN ts.task_billable = '1' THEN (UNIX_TIMESTAMP(rounded_up_time)* CAST(hourly_rate AS decimal) / 60)/60
	ELSE 0 END AS billable_amount,

	(SELECT st.status_name from Status_table st WHERE st.id = ta.status_id ) AS status

    From time_entry_agencies ta_a
	LEFT JOIN agencies ag ON ag.id = ta_a.agency_id
    RIGHT JOIN Time_entry ta ON ta_a.time_entry_id = ta.id
	LEFT JOIN Users us ON us.id = ta.user_id
	LEFT join  Time_entry_tasks ts ON ta.task_id = ts.id

    WHERE ta.is_deleted = '0'

	) AS multi_agency_time_entry
	GROUP BY id,billing_date,owner_name,billing_type,category,description,
  receipt,billable_duration,rejection_reason,
  non_billable_duration,original_working_time,rounded_up_time,
  expense_count,billable_count,non_billable_count,billable_amount,status
   ORDER BY id,billing_date,owner_name,billing_type,category,description,
  receipt,billable_duration,
  non_billable_duration,original_working_time,rounded_up_time,
  expense_count,billable_count,non_billable_count,billable_amount,status)
    ;`;

export const createBillingPeriodViewQuery = `CREATE VIEW billing_period_view
 AS
 SELECT YEAR(t1.billing_start_date) AS billing_year,
    MONTH(t1.billing_start_date) AS billing_month,
    sum(UNIX_TIMESTAMP(t2.billable_duration)) AS total_billable_duration,
    sum(UNIX_TIMESTAMP(t2.non_billable_duration)) AS total_non_billable_duration,
    sum(t2.billable_amount) AS total_amount,
    sum(t2.expense_count) AS expense_count,
    sum(t2.billable_count) AS billable_count,
    sum(t2.non_billable_count) AS non_billable_count,
    (SELECT t3.billing_period_status
           FROM billing_period_status_table t3
          WHERE t3.id = t1.billing_status_id) AS status,
    t1.id
   FROM billing_details_view t2
     RIGHT JOIN billing_periods t1 ON YEAR(t2.billing_date) = YEAR(t1.billing_start_date) AND MONTH(t2.billing_date) = MONTH(t1.billing_start_date)
  GROUP BY MONTH(t1.billing_start_date), YEAR(t1.billing_start_date), t1.billing_status_id, t1.id
  ORDER BY MONTH(t1.billing_start_date);
			;

`;
