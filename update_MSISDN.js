const mysql = require("mysql");
const request = require("request");
const axios = require("axios");

const con = mysql.createConnection({
    host: '10.240.37.125',
    user: 'navin',
    password: 'Zain@1234',
    database: 'node_backend'
});

con.connect(function (err) {
    if (err) {
        console.error('Error Connecting To Telco Database: ' + err.stack);
        return;
    }
    console.log('Connected To Telco Database With ID ' + con.threadId);
    start();
});


// Required Details
const newMsisdn = '831034585260' // new msisdn to be updated
const user_id = "b0df2600-1ba9-11ec-9582-d778b20f2b4d" // affected user


async function start() {
    let usersSimDetails = await getSimOrderData()
    let msisdnDetails = await getMsisdnDetails()

    if (usersSimDetails || msisdnDetails) {        
        console.log("\n++++++++++++++++ Process Initiated +++++++++++++++++++\n")
        console.log("\n=============== User's Sim Order Data ============\n")
        console.log("sim order Id \t", usersSimDetails.id)
        console.log("Sim order status \t", usersSimDetails.status)
        console.log("emailId \t", usersSimDetails.msisdn_transition_type)
        console.log("\n=============== MSISDN Details ===================\n")
        console.log("msisdn Id \t", msisdnDetails.id)
        console.log("msisdn \t", msisdnDetails.msisdn)
        console.log("status \t", msisdnDetails.status)

        console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌ Updating Sim Order Table  ◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")
        await updateSimOrderData(usersSimDetails.id, msisdnDetails.msisdn, msisdnDetails.id, usersSimDetails.status)
        console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌◌ Updating MSISDN Table ◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")
        await updateMsisdnTable(msisdnDetails.id)
        console.log("\n++++++++++++++++ Process Completed +++++++++++++++++++")
    }

    con.end()
    process.exit(0)
}

// get user's sim order details
function getSimOrderData() {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM telco_provisioning.user_sim_order where user_id in ('${user_id}')`
        con.query(query, (err, data) => {
            if (err) {
                console.log(err)
                process.exit(0)
            } else {
                resolve(JSON.parse(JSON.stringify(data[0])))
            }
        })
    })
}

// get msisdn details
function getMsisdnDetails() {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM inventory.msisdn where msisdn in ('${newMsisdn}')`;
        con.query(query, (err, data) => {
            if (err) {
                console.log(err);
                process.exit(0);
            } else {
                resolve(JSON.parse(JSON.stringify(data[0])));
            }
        });
    });
}

// update new msisdn details in sim order table
function updateSimOrderData(id, msisdn, msisdnId, simStatus) {
    return new Promise(async (resolve, reject) => {
        let query;
        if (simStatus == "INPROGRESS") {
            query = `UPDATE telco_provisioning.user_sim_order SET requested_msisdn = '${msisdn}', msisdn_id = '${msisdnId}', msisdn_request_time = now(), status = 'PAYMENT_DONE' WHERE id = '${id}' AND status IN ('INPROGRESS') AND msisdn_transition_type = 'NEW_NUMBER'`
        } else {
            query = `UPDATE telco_provisioning.user_sim_order SET requested_msisdn = '${msisdn}', msisdn_id = '${msisdnId}', msisdn_request_time = now() WHERE id = '${id}' AND status IN ('PAYMENT_DONE', 'DELIVERED', 'ROLLBACK') AND msisdn_transition_type = 'NEW_NUMBER'`
        }
        con.query(query, (err, data) => {
            if (err) {
                console.log(err);
                process.exit(0);
            } else {
                console.log(data);
                resolve(data);
            }
        });
    })
}

// update msisdn status
function updateMsisdnTable(msisdnId) {
    return new Promise(async (resolve, reject) => {
        const query = `UPDATE inventory.msisdn SET status = 'Reserve' WHERE id = '${msisdnId}'`
        con.query(query, (err, data) => {
            if (err) {
                console.log(err);
                process.exit(0);
            } else {
                console.log(data);
                resolve(data);
            }
        });
    })
}