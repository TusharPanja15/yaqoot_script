const mysql = require("mysql2");
const axios = require("axios");
const chalk = require('chalk'); // install version 2.4.1 only
const Spinner = require('cli-spinner').Spinner;

const con = mysql.createConnection({
    host: '10.240.37.125',
    user: 'tushar',
    password: 'ChangeMe@123',
    database: 'node_backend'
});

con.connect(function (err) {
    if (err) {
        console.error(chalk.bgRed(chalk.black('Error occured while connecting to database!!!')));
        return;
    }
    console.log(chalk.bgCyan(chalk.black('\n Connected!!! \n')));
    start();
});


// user ID
const userID = "c56c2920-a541-11ec-93f3-2514506d2db1";
// merchant_reference
const merchentReference = "34e8ceed-7927-4ba4-9095-39f8a6587a60";

const spinner = new Spinner();
spinner.setSpinnerString('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏');
spinner.setSpinnerDelay(60);

async function start() {

    spinner.start();
    spinner.setSpinnerTitle(chalk.cyan("Gathering info..."))
    await getUserData(userID)
        .then(result => {
            userResult = {
                ...result
            }
        })
        .catch(err => {
            console.log(chalk.bgRed(chalk.black("\n", err)));
            process.exit(0);
        })

    await getUserTransaction(merchentReference)
        .then(result => {
            transactionResult = {
                ...result
            }
        })
        .catch(err => {
            console.log(chalk.bgRed(chalk.black("\n", err)));
            process.exit(0);
        })

    await getUserDelivery(userID)
        .then(result => {
            deliveryResult = {
                ...result
            }
        })
        .catch(err => {
            console.log(chalk.bgRed(chalk.black("\n", err)));
        })

    spinner.stop(true);

    if ((JSON.stringify(userResult) !== '{}' && JSON.stringify(transactionResult) !== '{}') || JSON.stringify(deliveryResult) !== '{}') {

        if (userResult.user_id === transactionResult.user_id) {

            if (deliveryResult.shipment_status === "DELIVERED" || deliveryResult.dc_status === "DELIVERED") {
                delivery_status = "DELIVERED"
            } else {
                delivery_status = "PAYMENT_DONE"
            }

            finalUserData = {
                "sim_order_id": userResult.id,
                "sim_order_status": delivery_status,
                "user": userResult.user_id,
                "merchant_reference": transactionResult.merchant_reference,
                "transaction_id": transactionResult.id,
                "payment_status": transactionResult.transaction_status,
                "payment_type": transactionResult.transaction_type,
                "item": transactionResult.items_sku
            }
            console.log(finalUserData)
        } else {
            process.exit(0)
        }

        spinner.start();
        spinner.setSpinnerTitle(chalk.green("Updating Database..."));
        
        await updateUser(finalUserData)
            .then(() => {
                console.log(chalk.bgCyan(chalk.black("\n User's details Updated Successfully in Database !!! \n")));
                console.log(chalk.bgCyan(chalk.black("\n Please verify the change 🙏!!! \n")));
            })
            .catch(err => {
                console.log(chalk.bgRed(chalk.black("\n", err)));
            })

        spinner.stop(true);
    }
    con.end()
    process.exit(0)
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function getUserData(user) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM telco_provisioning.user_sim_order WHERE user_id IN ("${user}") ORDER BY modified_at DESC LIMIT 1`;
        con.query(query, (err, result) => {
            if (!result.length) {
                reject("No USER found with given user Id was found in Database!!!");
            } else {
                resolve(JSON.parse(JSON.stringify(result[0])));
            }
        });
    });
}

async function getUserTransaction(transaction) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM payment.transactions WHERE merchant_reference IN ("${transaction}") `;
        con.query(query, (err, result) => {
            if (!result.length) {
                reject("No PAYMENT found with given user Id was found in Database!!!");
            } else {
                resolve(JSON.parse(JSON.stringify(result[0])));
            }
        });
    });
}

async function getUserDelivery(delivery) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM delivery_gateway.user_delivery_details WHERE user_id IN ("${delivery}") ORDER BY modified_at DESC LIMIT 1 `;
        con.query(query, (err, result) => {
            if (!result.length) {
                reject("No DELIVERY found!!!");
            } else {
                resolve(JSON.parse(JSON.stringify(result[0])));
            }
        });
    });
}

async function updateUser(updatedUserDate) {
    return new Promise(async (resolve, reject) => {
        const query = `UPDATE telco_provisioning.user_sim_order SET status = "${updatedUserDate.sim_order_status}", transaction_id = "${updatedUserDate.transaction_id}", transaction_type = "PURCHASE", transaction_status = "SUCCESSFUL", merchant_reference = "${updatedUserDate.merchant_reference}" WHERE (id = "${updatedUserDate.sim_order_id}")`;
        con.query(query, (err, result) => {
            if (err) {
                reject("Can't update the Database!!!. Please update the data manually.");
            } else {
                resolve(result);
            }
        });
    });
}
