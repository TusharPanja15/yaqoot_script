const { QueryTypes } = require("sequelize");
const axios = require('axios').default;
const loggerService = require('../utils/logger');
const logger = new loggerService('HourlyKPI');
const hourlyKPI = async (sequalize) => {


    const activation = sequalize.query(`
    select b.Activation_KPIs, ifnull(count, 0) as count from 
    (
       SELECT 'ACTIVATED' AS Activation_KPIs
       UNION ALL
       SELECT 'NEW_SIM'
       UNION ALL
       SELECT 'OFFLINE_SIM'
       UNION ALL
       SELECT 'ESIM'
       UNION ALL
       SELECT 'ROLLBACK'
    )b
    left join
    (select 'ACTIVATED' as Activation_KPIs, count(*) as count,data_analysis.GETSETUPDATE(s.user_matrix_id) as setup_date from telco_provisioning.user_sim_order s
    where status in ('ACTIVATED')
    and data_analysis.GETSETUPDATE(s.user_matrix_id)  >= DATE_SUB(NOW(), INTERVAL 1 HOUR)        
    UNION ALL        
    select order_type, count(*),data_analysis.GETSETUPDATE(ss.user_matrix_id) as setup_date from telco_provisioning.user_sim_order ss
    where status in ('ACTIVATED')
    and data_analysis.GETSETUPDATE(ss.user_matrix_id) >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    group by status, order_type
    UNION ALL
    SELECT 'ROLLBACK', count(*),modified_at from telco_provisioning.user_sim_order sss
    where status in ('ROLLBACK')
    and modified_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) d
    on b.Activation_KPIs = d.Activation_KPIs
    order by FIELD(b.Activation_KPIs, 'ACTIVATED', 'NEW_SIM', 'OFFLINE_SIM', 'ESIM', 'ROLLBACK');
`, {type: QueryTypes.SELECT});

    const delivery = sequalize.query(`select b.shipment_status, ifnull(count, 0) as count from 
(
   SELECT 'SENT_TO_COURIER' AS shipment_status
   UNION ALL
   SELECT 'SCHEDULED'
   UNION ALL
   SELECT 'DELIVERED'
)b
left join
(SELECT udd.shipment_status, count(*) as count
from delivery_gateway.user_delivery_details udd
WHERE udd.modified_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
and udd.shipment_status in ('SENT_TO_COURIER', 'SCHEDULED', 'DELIVERED')
GROUP by udd.shipment_status) d
on b.shipment_status = d.shipment_status
order by FIELD(b.shipment_status, 'SCHEDULED', 'SENT_TO_COURIER', 'DELIVERED')
;`, {type: QueryTypes.SELECT});

    const payment = sequalize.query(`select b.transaction_status, ifnull(d.count, 0) as count from 
(
   SELECT 'SUCCESSFUL' AS transaction_status
   UNION ALL
   SELECT 'APP'
   UNION ALL
   SELECT 'PAYMENT_LINK'
   UNION ALL
   SELECT 'REFUNDED'
   UNION ALL
   SELECT 'FAILED'
) b
left join
(
SELECT transaction_status, COUNT(*) as count FROM  payment.transactions
WHERE transaction_status = 'SUCCESSFUL' -- WHERE transaction_status IN ('SUCCESSFUL', 'REFUNDED', 'FAILED')
and modified_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY transaction_status
union all
SELECT payment_source AS transaction_status, COUNT(*) as count FROM  payment.transactions
WHERE transaction_status = 'SUCCESSFUL'
and modified_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY payment_source
UNION ALL
SELECT transaction_status, COUNT(*) as count FROM  payment.transactions
WHERE transaction_status IN ('REFUNDED', 'FAILED')
and modified_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY transaction_status
) d
on b.transaction_status = d.transaction_status
order by FIELD(b.transaction_status, 'SUCCESSFUL','APP','PAYMENT_LINK', 'REFUNDED', 'FAILED')
;`, {type: QueryTypes.SELECT});

    const esimInventory = sequalize.query(`select b.sim_type, ifnull(count, 0) as count from 
(
SELECT 'ESIM' AS sim_type
)b
left join
(SELECT  type, COUNT(*) as count FROM inventory.sim
WHERE type = 'ESIM'
AND status = 'Available') d
on d.type = b.sim_type;`, {type: QueryTypes.SELECT});

    const msisdnInventory = sequalize.query(`SELECT  msisdn_type,count(*) FROM inventory.msisdn
where status = 'Available'
group by status, msisdn_type
order by msisdn_type asc
;`, {type: QueryTypes.SELECT});

    const DeviceInventory = sequalize.query(`select
    b.status,
    ifnull(count, 0) as count
  from
    (
      SELECT
        'IN_WAREHOUSE' AS status
      union all
      SELECT
        'ISSUED'
      union all
      SELECT
        'SALES'
    ) b
    left join (
      (
        SELECT
          case when pi.status = 'ISSUED' then 'ISSUED' else 'IN_WAREHOUSE' end as status,
          COUNT(*) as count
        FROM
          device_inventory.product_items pi
          JOIN device_inventory.products p ON pi.product_id = p.id
        WHERE
          --     status IN ('ISSUED' , 'IN_WAREHOUSE')
          --     and
          case when p.name like 'Iphone%' then 'IPhone' when p.name like 'Nokia%' then '5G Router' else p.name end = '5G Router'
        group by
          pi.status
      )
      UNION ALL
        (
          SELECT
            'SALES' as status,
            count(t.id)
          FROM
            payment.transactions t
            JOIN device_inventory.\`item_issuances\` ii ON (t.id = ii.\`payment_transaction_id\`)
            LEFT JOIN data_analysis.sku_items si ON JSON_UNQUOTE(
              JSON_EXTRACT(\`t\`.\`items_sku\`, '$[0]')
            ) = si.sku
          WHERE
            ii.\`status\` = "COMPLETED" AND
            order_type = 'device'
            AND transaction_status = 'SUCCESSFUL'
            AND CASE WHEN si.name LIKE 'Iphone%' THEN 'IPhone' WHEN si.name LIKE 'nokia%' THEN '5G Router' ELSE si.name END = '5G Router'
        )
    ) d on d.status = b.status;`, {type: QueryTypes.SELECT});

    const iphone = sequalize.query(`select b.status, ifnull(count, 0) as count from 
(
SELECT 'IN_WAREHOUSE' AS status
union all
SELECT 'ISSUED'
union all
SELECT 'SALES'
)b
left join
((SELECT 
    case when pi.status = 'ISSUED' then 'ISSUED' else 'IN_WAREHOUSE' end as status, COUNT(*) as count
FROM
    device_inventory.product_items pi
        JOIN
    device_inventory.products p ON pi.product_id = p.id
WHERE
--     status IN ('ISSUED' , 'IN_WAREHOUSE')
--     and 
    case when p.name like 'Iphone%' then 'IPhone' when p.name like 'Nokia%' then '5G Router' else p.name end = 'IPhone'
    group by pi.status)
UNION ALL
(SELECT 
    'SALES' as status, count(t.id)
FROM
    payment.transactions t
        LEFT JOIN
    data_analysis.sku_items si 
    ON JSON_UNQUOTE(JSON_EXTRACT(\`t\`.\`items_sku\`, '$[0]')) = si.sku
WHERE
    order_type = 'device'
        AND transaction_status = 'SUCCESSFUL'
        AND CASE
        WHEN si.name LIKE 'IPhone%' THEN 'IPhone'
        WHEN si.name LIKE 'nokia%' THEN '5G Router'
        ELSE si.name
    END = 'IPhone')) d
on d.status = b.status;`, {type: QueryTypes.SELECT});

    let reportText =  new Date().toLocaleString() + "\n";

    const listKPIs = ["Activation KPIs:", "Delivery KPIs:", "Payment KPIs:", "eSIM Inventory:", "MSISDN Inventory:", "5G Router:", "iPhone:"];
    const results = await Promise.all([activation, delivery, payment, esimInventory, msisdnInventory, DeviceInventory, iphone]);


    results.forEach((result, i)=>{
        reportText += `\n${listKPIs[i]}\n`;
        result.forEach(item => {
            for (const [i, value] of Object.entries(item)) {
                reportText += `${value}\t - `;
            }
            reportText = reportText.replace(/\t - $/, "");
            reportText += "\n";
        });
    });


    reportText += "\n ©O/M/H/M";
    logger.info("Hourly KPI");
    logger.info(reportText);

    if(process.env.NODE_ENVIRONMENT === "production"){ 
        ["592442747", "592443079", "592442821", "592442261", "592441379", "592443066", "592443296", "592443434","592443498", "592443558", "592443415"].forEach(phone => {
            axios.post('https://zainAlerts:zainAlerts@123@prodokd.maanaginx.com/notification/crm/sms', {
                "phoneNumber": phone,
                "message": reportText,
                "senderNameKey": "KPI" 
            }).then((res)=> logger.info(res.body));
        });
    }



};

module.exports = hourlyKPI;
