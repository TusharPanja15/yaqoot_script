const mysql = require("mysql");
const request = require("request");
const axios = require("axios");
const { reject } = require("lodash");

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
const MSISDN = '831034581861' // msisdn to reprovisioned


async function start() {
    let matrixData = await getMatrixData()

    if (matrixData) {
        
        const networkData = await getNetwork(matrixData);

        console.log("\n|+++++++ Reprovising Process Initiated ++++++++++|\n")
        console.log("\n============== User's Matrix Data ================\n")
        console.log("user_id \t", matrixData.user_id)
        console.log("sim_status \t", matrixData.sim_status)
        console.log("msisdn \t", matrixData.msisdn)
        console.log("imsi \t", matrixData.imsi)
        console.log("iccid \t", matrixData.iccid)
        console.log("ki \t", matrixData.ki)
        console.log("\n================ Network Details ================\n")
        console.log(`EMA MSISDN \t${networkData.data.parsed[0].msisdn[0]}`)
        console.log(`SIM IMSI \t${networkData.data.parsed[0].imsi[0]}`)
        console.log(`Charge Type \t${networkData.data.parsed[0].hssSub[0].hssLstSub[0].gprsData[0].group[1].charge}`)
        console.log("\nIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII\n")
        console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌◌ Deleting Network ◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")
        await deleteNetwork(networkData);
        console.log("\n◌◌◌◌◌◌◌◌◌◌◌◌◌◌ Creating Network ◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌◌\n")
        await createNetwork(matrixData);
        console.log("\nIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII\n")
        console.log("\n======= Network Details after Reprovining =======\n")
        console.log(`EMA MSISDN \t${networkData.data.parsed[0].msisdn[0]}`)
        console.log(`SIM IMSI \t${networkData.data.parsed[0].imsi[0]}`)
        console.log(`Charge Type \t${networkData.data.parsed[0].hssSub[0].hssLstSub[0].gprsData[0].group[1].charge}`)
        console.log("\n|++++++ Reprovisiong Process Completed ++++++++++|\n")

    }
    con.end()
    process.exit(0)
}


// get user's Matrix details
function getMatrixData() {
    return new Promise(async (resolve, reject) => {
        const query = `SELECT * FROM telco_provisioning.user_matrix where msisdn in (${MSISDN}) and sim_status = 'ACTIVATED'`
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


// get msisdn details from network
async function getNetwork(matrix) {
    return new Promise(async (resolve, reject) => {
        await axios.get('https://prodokd.maanaginx.com/network-provisioning/internal/status/msisdn/' + matrix.msisdn).then(data => {
            // console.log(data.data);
            resolve(data.data);
        });
    });
}


// deleting msisdn from the network
async function deleteNetwork(networkData) {
    return new Promise(async (resolve, reject) => {
        await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/delete', {
            "msisdn": networkData.data.parsed[0].msisdn[0],
            "imsi": networkData.data.parsed[0].imsi[0]
        }).then(data => {
            console.log(data.data);
            resolve(data.data);
        });
    });
}


// creating network for the msisdn
async function createNetwork(matrix) {
    return new Promise(async (resolve, reject) => {

        if (MSISDN.length > 9) {
            await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/create/data', {
                "msisdn": matrix.msisdn,
                "imsi": matrix.imsi,
                "ki": matrix.ki
            }).then(data => {
                console.log(data.data);
                resolve(data.data);
            });
        } else {
            await axios.post('https://prodokd.maanaginx.com/network-provisioning/internal/subscribe/create', {
                "msisdn": matrix.msisdn,
                "imsi": matrix.imsi,
                "ki": matrix.ki
            }).then(data => {
                console.log(data.data);
                resolve(data.data);
            });
        }

    });
}