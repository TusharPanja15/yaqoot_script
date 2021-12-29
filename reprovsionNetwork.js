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
const MSISDNS = [] // msisdns to reprovisioned

var done = []
var failed = []
var notFound = []

async function start() {

    const UNDERLINE = "\x1B[4m";
    const RESET = "\x1B[0m";

    console.info("\n|+++++++++++ Reprovising Process Initiated +++++++++++|\n")

    for (let i = 0; i < MSISDNS.length; i++) {

        let matrixData = await getMatrixData(MSISDNS[i])

        if (matrixData) {

            console.log("\n------------- DATA for '", matrixData.msisdn, "' -------------")
            console.log("\n\t\t" + UNDERLINE + " User's Matrix \n" + RESET)
            console.log("user_id \t", matrixData.user_id)
            console.log("sim_status \t", matrixData.sim_status)
            console.log("msisdn \t", matrixData.msisdn)
            console.log("imsi \t", matrixData.imsi)
            console.log("iccid \t", matrixData.iccid)
            console.log("ki \t", matrixData.ki)

            let networkData = await getNetwork(matrixData);

            if (networkData != 400) {

                console.log("\n\t\t" + UNDERLINE + " Network Details \n" + RESET)
                console.log(`EMA MSISDN \t${networkData.data.parsed[0].msisdn[0]}`)
                console.log(`SIM IMSI \t${networkData.data.parsed[0].imsi[0]}`)
                console.log(`Charge Type \t${networkData.data.parsed[0].hssSub[0].hssLstSub[0].gprsData[0].group[1].charge}`)

            } else {
                console.log("\n\t\t" + UNDERLINE + " Network Details \n" + RESET)
                console.log(`Not found in EMA`)
            }

            console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")

            console.warn("\n\t\t" + UNDERLINE + " Deleting from Network \n" + RESET)
            await deleteNetwork(networkData)
            console.log("\n\t\t" + UNDERLINE + " Creating in Network \n" + RESET)
            await createNetwork(matrixData)
            
            console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")

            networkData = await getNetwork(matrixData);

            console.log("\n\t" + UNDERLINE + " Network Details after Reprovining \n" + RESET)
            console.log(`EMA MSISDN \t${networkData.data.parsed[0].msisdn[0]}`)
            console.log(`SIM IMSI \t${networkData.data.parsed[0].imsi[0]}`)
            console.log(`Charge Type \t${networkData.data.parsed[0].hssSub[0].hssLstSub[0].gprsData[0].group[1].charge}`)

            // await add5G(matrixData, networkData);

            console.log("\n------------------------------------------------------")
            console.log("------------------------------------------------------\n\n")

        }
    }

    console.log("\n|++++++++++++ Reprovisiong Process Completed +++++++++++|\n")

    console.log("Reprovising done:", done,"\n")
    console.log("Reprovising failed:", failed,"\n")
    console.log("Data not found:", notFound,"\n")

    con.end()
    process.exit(0)
}


// get user's Matrix details
async function getMatrixData(msisdn_arr) {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM telco_provisioning.user_matrix where msisdn in (${msisdn_arr}) AND sim_status in ('ACTIVATED')`
        con.query(query, (err, results) => {
            if (!results.length) {
                notFound.push(msisdn_arr)
                resolve()
            } else if (results.length > 0) {
                resolve(JSON.parse(JSON.stringify(results[0])))
            }
        })
    })
}

// get msisdn details from network
async function getNetwork(matrix) {
    return new Promise(async (resolve, reject) => {
        await axios.get('https://prodokd.maanaginx.com/network-provisioning/internal/status/msisdn/' + matrix.msisdn)
            .then(result => {
                done.push(matrix.msisdn)
                resolve(result.data)
            })
            .catch(error => {
                failed.push(matrix.msisdn)
                resolve(400)
            })
    });
}


// deleting msisdn from the network
async function deleteNetwork(networkData) {
    return new Promise(async (resolve, reject) => {
        await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/delete', {
            "msisdn": networkData.data.parsed[0].msisdn[0],
            "imsi": networkData.data.parsed[0].imsi[0]
        })
            .then(result => {
                console.log(result.data);
                resolve(result.data);
            })
            .catch(error => {
                console.log(error.response.data)
                resolve(error.response.data)
            })
    });
}


// creating network for the msisdn
async function createNetwork(addingMsisdn) {
    return new Promise(async (resolve, reject) => {

        if (addingMsisdn.msisdn.length > 9 && addingMsisdn.msisdn.length == 12) {
            
            await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/create/data', {
                "msisdn": addingMsisdn.msisdn,
                "imsi": addingMsisdn.imsi,
                "ki": addingMsisdn.ki
            })
                .then(result => {
                    done.push(addingMsisdn.msisdn)
                    console.log(result.data)
                    resolve(result.data)
                })
                .catch(error => {
                    failed.push(addingMsisdn.msisdn)
                    console.log(error.response.data)
                    resolve()
                })

        } else if (addingMsisdn.msisdn.length == 9) {

            await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/create', {
                "msisdn": addingMsisdn.msisdn,
                "imsi": addingMsisdn.imsi,
                "ki": addingMsisdn.ki
            })
                .then(result => {
                    done.push(addingMsisdn.msisdn)
                    console.log(result.data)
                    resolve(result.data)
                })
                .catch(error => {
                    failed.push(addingMsisdn.msisdn)
                    console.log(error.response.data)
                    resolve()
                })

        } else {
            console.log("Wrong number format!!!")
        }
    });
}


//// add 5G
// async function add5G(matrixData, networkData) {
//     return new Promise(async (resolve, reject) => {
//         await axios.post('https://prodokd.maanaginx.com/telco-provision/internal/telco/store/5G', {
//             "userId": matrixData.user_id,
//             "imsi": networkData.data.parsed[0].imsi[0],
//             "msisdn": networkData.data.parsed[0].msisdn[0],
//             "package_sku": "1X_esim"
//         }).then(data => {
//             console.log(data.data);
//             resolve(data.data);
//         });
//     });
// }