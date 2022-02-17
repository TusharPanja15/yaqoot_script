const mysql = require("mysql2");
const axios = require("axios");
const figlet = require('figlet');
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


// Magento ID
const magentoID = "55593";

// Magento access token
const uat_magento_token = '9op8s20h08l44fkubsprxe8xlzdren56';

const searchField = ["entity_id", "email"]
const spinner = new Spinner();
spinner.setSpinnerString('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏');
spinner.setSpinnerDelay(60);

async function start() {

    spinner.start();
    spinner.setSpinnerTitle(chalk.cyan("Gathering info..."))
    await getUserData(magentoID)
        .then(fetched => {
            return fetched;
        })
        .then(result => {
            mergeResult = {
                ...result
            }
        })
        .catch(err => {
            console.log(chalk.bgRed(chalk.black("\n", err)));
            process.exit(0);
        })

    spinner.stop(true);

    if (JSON.stringify(mergeResult) !== '{}') {
        await getUserMatrixData(mergeResult.id)
            .then(fetched => {
                return fetched;
            })
            .then(result => {
                mergeResult = {
                    ...mergeResult,
                    ...result,
                    "id": mergeResult.id,
                    "store_id": 2
                }
            })
            .catch(err => {
                //console.log(chalk.red(err))
                mergeResult = {
                    ...mergeResult,
                    "first_name": mergeResult.name,
                    "last_name": "lastname",
                    "store_id": 1
                }
            })

           // console.log(mergeResult)
        
        // find the customer in magneto
        for (let i = 0; i < searchField.length; i++) {
            spinner.start();
            spinner.setSpinnerTitle(chalk.cyan("Finding customer..."));

            if (searchField[i] == "entity_id") {
                searchValue = mergeResult.magento_id
            } else {
                searchValue = mergeResult.email_id
            }

            await getUserFromMagento(searchField[i], searchValue)
                .then((result) => {
                    magentoStatus = result
                })
                .catch(err => {
                    console.log(err);
                    process.exit(0);
                })

            if (magentoStatus.total_count == 1) {
                console.log(chalk.bgCyan(chalk.black("\n User found in Magento with", chalk.bgYellow(chalk.black(searchField[i])), "!!! \n")));
                userFound = true;
                if (searchField[i] == "entity_id") {
                    userFoundById = true;
                } else {
                    mergeResult = {
                        ...mergeResult,
                        "magento_id": magentoStatus.items[0].id
                    }
                    userFoundById = false;
                }
                break;
            } else {
                spinner.stop(true);
                console.log(chalk.bgRed(chalk.black("\n No user found in Magento with ", chalk.bgGreen(chalk.black(searchField[i])), "!!! \n")));
                userFound = false;
            }
            spinner.stop(true);
        }


        if ((userFound && userFoundById) || (userFound && !userFoundById)) {

            // if customer was found by magento_id or by email_id in magento
            spinner.setSpinnerTitle(chalk.yellow("Updating customer..."));

            await updateCustomerOnMagento(mergeResult)
                .then(result => {
                    console.log(chalk.bgCyan(chalk.black("\n Customer Updated Successfully in Magento !!! \n")));
                    updatedCustomer = {
                        "user_id": mergeResult.id,
                        "updated_magento_id": result.id,
                        "updated_email": result.email
                    }
                })
                .catch(err => {
                    console.log(err);
                    process.exit(0);
                })

            spinner.stop(true);

        } else if (!userFound) {

            // if customer was not found in magento
            console.log(chalk.bgRed(chalk.black("\n User was not found,", chalk.bgYellow(chalk.black("Creating one in magento...")), "\n")));
            spinner.setSpinnerTitle(chalk.yellow("Creating customer..."));
            
            await createCustomerOnMagento(mergeResult)
                .then(result => {
                    console.log(chalk.bgCyan(chalk.black("\n Customer Created Successfully in Magento !!! \n")))
                    updatedCustomer = {
                        "user_id": mergeResult.id,
                        "updated_magento_id": result.id,
                        "updated_email": result.email
                    }
                })
                .catch(err => {
                    console.log(err);
                    process.exit(0);
                })
            spinner.stop(true);

        }


        // updating the customer in user's table
        if (JSON.stringify(updatedCustomer) !== '{}') {
            console.log("\n", updatedCustomer, "\n");
            spinner.start();
            spinner.setSpinnerTitle(chalk.green("Updating Database..."));

            await updateUserData(updatedCustomer)
                .then(() => {
                    console.log(chalk.bgCyan(chalk.black("\n User's details Updated Successfully in Database !!! \n")));
                })
                .catch(err => {
                    console.log(chalk.bgRed(chalk.black("\n", err)));
                })

            spinner.stop(true);
        } else {
            process.exit(0)
        }
    }

    con.end()
    process.exit(0)
}




/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function getUserData(magentoID) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM node_backend.users WHERE magento_id IN (${magentoID})`;
        con.query(query, (err, result) => {
            if (!result.length) {
                reject("No user found with given Magento Id was found in Database!!!");
            } else {
                resolve(JSON.parse(JSON.stringify(result[0])));
            }
        });
    });
}

async function getUserMatrixData(userId) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM telco_provisioning.user_matrix WHERE user_id IN ("${userId}") AND sim_status IN ("ACTIVATED") `;
        con.query(query, (err, result) => {
            if (!result.length) {
                reject("No Matrix Data Available");
            } else {
                resolve(JSON.parse(JSON.stringify(result[0])));
            }
        });
    });
}

async function updateUserData(updatedCustomerDetails) {
    return new Promise(async (resolve, reject) => {
        const query = `UPDATE node_backend.users SET magento_id = '${updatedCustomerDetails.updated_magento_id}', email_id = '${updatedCustomerDetails.updated_email}', status = '1' WHERE (id = '${updatedCustomerDetails.user_id}');`;
        con.query(query, (err, result) => {
            if (err) {
                reject("Can't update the Database!!!. Please update the above user's data manually in Database.");
            } else {
                resolve(result);
            }
        });
    });
}


async function getUserFromMagento(searchField, searchUser) {
    return new Promise(async (resolve, reject) => {
        await axios.get('https://prodmagento.maanaginx.com/rest/V1/customers/search/', {
            headers: {
                'Authorization': `Bearer ${uat_magento_token}`
            },
            params: {
                "searchCriteria[filter_groups][0][filters][0][condition_type]": "eq",
                "searchCriteria[filter_groups][0][filters][0][field]": `${searchField}`,
                "searchCriteria[filter_groups][0][filters][0][value]": `${searchUser}`
            }
        })
            .then(result => {
                resolve(result.data)
            })
            .catch(err => {
                reject(err.response.data)
            })
    });
}

async function updateCustomerOnMagento(customer) {
    return new Promise(async (resolve, reject) => {
        await axios.put('https://prodmagento.maanaginx.com/rest/default/V1/customers/' + customer.magento_id, {
            "customer": {
                "id": customer.magento_id,
                "email": customer.email_id,
                "firstname": customer.first_name,
                "lastname": customer.last_name,
                "website_id": 1,
                "custom_attributes": [
                    {
                        "attribute_code": "customer_status",
                        "value": 1
                    },
                    {
                        "attribute_code": "phone_no",
                        "value": customer.phone_no
                    },
                    {
                        "attribute_code": "allow_notification",
                        "value": customer.allow_notification
                    },
                    {
                        "attribute_code": "phone_type",
                        "value": customer.phone_type
                    }
                ],
                "store_id": customer.store_id
            }
        },
            {
                headers: {
                    'Authorization': `Bearer ${uat_magento_token}`
                }
            })
            .then(result => {
                //console.log(result.data);
                resolve(result.data);
            })
            .catch(err => {
                reject(err.response.data)
            })
    });
}

async function createCustomerOnMagento(newCustomer) {
    return new Promise(async (resolve, reject) => {
        await axios.post('https://prodmagento.maanaginx.com/rest/V1/customers/', {
            "customer": {
                "email": newCustomer.email_id,
                "firstname": newCustomer.first_name,
                "lastname": newCustomer.last_name,
                "website_id": 1,
                "custom_attributes":
                    [
                        {
                            "attribute_code": "customer_status",
                            "value": 1
                        },
                        {
                            "attribute_code": "phone_no",
                            "value": newCustomer.phone_no
                        },
                        {
                            "attribute_code": "imei",
                            "value": newCustomer.imsi
                        },
                        {
                            "attribute_code": "imsi",
                            "value": newCustomer.imsi
                        },
                        {
                            "attribute_code": "profile_pic_url",
                            "value": newCustomer.profile_pic
                        },
                        {
                            "attribute_code": "allow_notification",
                            "value": newCustomer.allow_notification
                        },
                        {
                            "attribute_code": "phone_type",
                            "value": newCustomer.phone_type
                        },
                        {
                            "attribute_code": "referral_code",
                            "value": newCustomer.referral_code
                        }
                    ]
            },
            "password": "Poiutrewq123"
        },
            {
                headers: {
                    'Authorization': `Bearer ${uat_magento_token}`
                }
            }
        )
            .then(result => {
                //console.log(result.data);
                resolve(result.data);
            })
            .catch(err => {
                reject(err.response.data)
            })
    });
}