const readline = require("readline")

const mysql = require("mysql2")
const axios = require("axios")
const chalk = require("chalk") // install version 2.4.1 only
const Spinner = require("cli-spinner").Spinner

const spinner = new Spinner()
spinner.setSpinnerString('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏')
spinner.setSpinnerDelay(60)

const con = mysql.createConnection({
    host: '10.240.37.125',
    user: "tushar",
    password: "ChangeMe@123",
    database: "node_backend"
})

spinner.start()
spinner.setSpinnerTitle(chalk.cyan("Connecting to the servers..."))

con.connect(function (err) {
    if (err) {
        console.error(chalk.bgRed(chalk.black("Error occured while connecting to database!!!")));
        return;
    }
    spinner.stop(true)
    console.log(chalk.bgCyan(chalk.black("\n Connected!!! \n")))
    start()
})

function prompt(question) {
    const userInput = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise((resolve, err) => {
        userInput.question(question, answer => {
            userInput.close()
            resolve(answer.trim())
        })
    })
}

async function start() {

    let searchField = await prompt(chalk.green.bold("Enter phone_no./email: "))
    spinner.start()
    spinner.setSpinnerTitle(chalk.cyan("Gathering info..."))

    try {
        
        const userResult = await getuserData(searchField)
        const userSimOrderResult = await getuserSimOrderData(userResult[0].id)
        
        spinner.stop(true)

        if (userSimOrderResult.isEmpty) {
            const error = new Error(err);
            throw error;
        }

        let isPaymentDone = false;

        for (let i = 0; i < userSimOrderResult.length; i++) {
            if (userSimOrderResult[i].status === "PAYMENT_DONE") {
                isPaymentDone = true;
                break;
            }
        }

        let num
        let maxCount = 5

        do {
            if (maxCount > 0) {
                if (num > 3 || num == 0) {
                    console.log(chalk.bgRed(chalk.black("\n Invalid Input ...")));
                }
                let deliveryType = await prompt(chalk.yellow.bold("\n Select the delivery option for the user. \n\n 1. Want to re-schedule it from API? \n 2. Want to let user to re-schedule it? \n 3. Want to fix 'Sim already delivered flow error'? \n\n Select option: "))
                num = Number(deliveryType)
                maxCount--
            }
            else {
                throw new Error("Limit Reached!!! Please try with valid input.");
            }
        } while (num > 3 || num == 0)

        const shipmentData = await getUserDelivery(userResult[0].id)

        let deliveryResult;

        switch (num) {
            case 1:

                let orderType = await prompt(chalk.yellow.bold("\n Select the delivery order type. \n 1. NEW SIM order? \n 2. REPLACEMENT SIM order? \n Select option: "))
                if (!isPaymentDone && orderType == 1) {
                    const error = new Error("No user's sim order found with complete payment");
                    throw error;
                }
                if (orderType > 2) {
                    const error = new Error("Invalid input");
                    throw error;
                }
                let city = await prompt(chalk.green.bold("\n Enter city name: "))
                let lat = await prompt(chalk.green.bold("\n Enter latitude: "))
                let long = await prompt(chalk.green.bold("\n Enter longitude: "))
                let contactNumber = userResult[0].phone_no || await prompt(chalk.green.bold("\n Enter contact number: "))

                let location = await getLocation(lat, long)

                let date = new Date()
                let mins = date.getMinutes()
                let hrs = date.getHours()   // Getting hours
                let m = (Math.round(mins / 60 * 60 * 1000) * (60 * 60 * 1000)) % 60;
                m = m < 10 ? '0' + m : m;   // Converting '09:0' to '09:00'
                let h = mins > 52 ? (hrs === 23 ? 0 : ++hrs) : hrs;
                h = h < 10 ? '0' + h : h;   // Converting '9:00' to '09:00'
                if ((h >= '23') || (h < '8')) {
                    h = 8
                }
                let slot_start = ((h % 12) || 12) + ":" + m + (h >= 12 ? 'PM' : 'AM');
                ch = h + 2;
                let slot_end = ((ch % 12) || 12) + ":" + m + (ch >= 12 ? 'PM' : 'AM');
                let slotTime = slot_start + " - " + slot_end;
                let slotDate = date.toString().substring(4, 15) + " " + h + ":" + m;

                shipment = {
                    "selectID": 1,
                    "city": city,
                    "lat": location.data.data[0].latitude,
                    "long": location.data.data[0].longitude,
                    "address": location.data.data[0].label,
                    "contactNumber": contactNumber,
                    "date": new Date(slotDate).getTime(),
                    "slotTime": slotTime,
                    "auth_token": userResult[0].auth_token
                }

                spinner.start()
                spinner.setSpinnerTitle(chalk.cyan("Creating shipment..."))
                deliveryResult = await postUserDelivery(shipment)
                let newShipment = await getUserDelivery(userResult[0].id)

                if (orderType == 2 && newShipment[0].shipment_status == "SCHEDULED") {
                    await updateUserDelivery(newShipment[0].id, orderType)
                }

                spinner.stop(true)
                console.log(chalk.bgCyan(chalk.black("\n", deliveryResult)))
                console.log(chalk.bgCyan(chalk.black("\n Order ID -->", newShipment[0].yaqoot_order_id, "\n")))

                break;

            case 2:

                if (!isPaymentDone) {
                    const error = new Error("No user's sim order found with complete payment");
                    throw error;
                }

                shipment = {
                    "selectID": 2,
                    "userID": userResult[0].id
                }

                if (!shipmentData.length) {
                    spinner.start()
                    spinner.setSpinnerTitle(chalk.cyan("Creating record..."))
                    deliveryResult = await postUserDelivery(shipment)
                } else {
                    spinner.start()
                    spinner.setSpinnerTitle(chalk.cyan("Updating records..."))
                    for (let i = 0; i < shipmentData.length; i++) {
                        if (shipmentData[i].shipment_status != "CANCELLED" || shipmentData[i].shipment_sub_status != "CANCELLED") {
                            deliveryResult = await updateUserDelivery(shipmentData[i].id)
                        } else {
                            deliveryResult = "All records are marked CANCELLED!";
                        }
                    }
                }

                spinner.stop(true)
                console.log(chalk.bgCyan(chalk.black("\n", deliveryResult, "\n")))

                break;

            case 3:

                if (!shipmentData.length) {
                    const error = new Error("Delivery record is empty!!!");
                    throw error;
                }

                spinner.start()
                spinner.setSpinnerTitle(chalk.cyan("Updating records..."))
                for (let i = 0; i < shipmentData.length; i++) {
                    if (shipmentData[i].shipment_status != "CANCELLED" || shipmentData[i].shipment_sub_status != "CANCELLED") {
                        deliveryResult = await updateUserDelivery(shipmentData[i].id)
                    } else {
                        deliveryResult = "All records are marked CANCELLED!";
                    }
                }
                
                spinner.stop(true)
                console.log(chalk.bgCyan(chalk.black("\n", deliveryResult, "\n")))

                break;

            default:
                throw new Error(err);
        }

    } catch (err) {
        console.log(err)
        // console.log(chalk.bgRed(chalk.black("\n", err, "\n")))
    }

    spinner.stop(true)
    start()
}

getuserData = (dataString) => {
    return new Promise((resolve, reject) => {
        con.query(`SELECT * FROM node_backend.users WHERE phone_no = "${dataString}" OR email_id = "${dataString}"`, (error, result) => {
            if (!result.length) {
                return reject(chalk.bgRed(chalk.black(`\n\n No user found with "${dataString}" user in Database!!! \n`)))
            }
            return resolve(JSON.parse(JSON.stringify(result)))
        })
    })
}

getuserSimOrderData = (dataString) => {
    return new Promise((resolve, reject) => {
        con.query(`SELECT * FROM telco_provisioning.user_sim_order WHERE user_id IN ("${dataString}") ORDER BY modified_at DESC`, (error, result) => {
            if (!result.length) {
                return reject("No user sim order found for the user in Database!!!")
            }
            return resolve(JSON.parse(JSON.stringify(result)))
        })
    })
}

getUserDelivery = (dataString) => {
    return new Promise((resolve, reject) => {
        con.query(`SELECT * FROM delivery_gateway.user_delivery_details WHERE user_id IN ("${dataString}") ORDER BY modified_at DESC`, (err, result) => {
            if (!err) {
                return resolve(result)
            }
        })
    })
}

updateUserDelivery = (delivery_id, order_type) => {
    return new Promise((resolve, reject) => {
        let query;
        query = `UPDATE delivery_gateway.user_delivery_details SET shipment_status = "CANCELLED", shipment_sub_status = "CANCELLED" WHERE (id = "${delivery_id}")`;
        if (order_type == 2) {
            query = `UPDATE delivery_gateway.user_delivery_details SET order_type = "RE_ORDER", others = JSON_SET(others, "$.reorder", true) WHERE (id = "${delivery_id}")`;
        }
        con.query(query, (err, result) => {
            if (err) {
                return reject("Database updation failed.")
            }
            return resolve("Record Updated!")
        })
    })
}

getLocation = (lat, long) => {
    return new Promise((resolve, reject) => {
        axios.get(`http://api.positionstack.com/v1/reverse?access_key=c52b7ecc114d85d10e2b60d44fcd16dd&query=${lat},${long}&limit=1`)
            .then(response => {
                resolve(response)
            })
            .catch(err => {
                reject(err)
            })
    })
}

postUserDelivery = (shipmentDetails) => {
    return new Promise((resolve, reject) => {

        if (shipmentDetails.selectID == 2) {   // insert into database

            con.query(`INSERT INTO delivery_gateway.user_delivery_details ( id, user_id, order_type, selected_year, selected_month, selected_date, selected_slot, err_status, retry_payment_failure, address, city, country, latitude, longitude, is_entered_manually, slot_date, slot_from, slot_to, shipping_notes, order_history_note, order_tracking_number, order_delivery_company, yaqoot_order_id, shipping_id, shipment_status, shipment_sub_status, customer_info, others, label_link, order_creation_failed, created_at, modified_at, driver_info, order_sent_to_delivery_company_at, order_sent_to_oto_at, dc_status, oto_service_type, items) VALUES ( uuid(), "${shipmentDetails.userID}", "SIM_ORDER", "2022", "3", "2", "5:30PM - 7:30PM", null, null, "المحمدية، Walyal Ahd Dist., Mecca 24353", "Mecca", "SA", "21.3737609", "39.7892544", "0", "24/2/2022", "5:30PM", "7:30PM", "", null, null, null, null, null, "CANCELLED", "CANCELLED", null, null, null, 1, now(), now(), null, null, null, null, "courier", null )`, (err, result) => {
                if (err) {
                    return reject("Decoy record creation failed!")
                }
                return resolve("Record Added!")
            })

        } else if (shipmentDetails.selectID == 1) {  // via API

            axios.post('https://prodokd.maanaginx.com/delivery-gateway/delivery/scheduleShipment', {

                "cityName": shipmentDetails.city,
                "otoServiceType": "courier",
                "address": {
                    "location": {
                        "latitude": shipmentDetails.lat,
                        "longitude": shipmentDetails.long
                    },
                    "text": shipmentDetails.address,
                    "remarks": ""
                },
                "selectedSlot": {
                    "date": shipmentDetails.date,
                    "slot": shipmentDetails.slotTime
                },
                "deliveryContactNumber": shipmentDetails.contactNumber

            },
                {
                    headers: {
                        'Authorization': `Bearer ${shipmentDetails.auth_token}`
                    }
                })
                .then(result => {
                    resolve("Shipment Created!")
                })
                .catch(err => {
                    reject(err.response.data)
                })
        }
    })
}