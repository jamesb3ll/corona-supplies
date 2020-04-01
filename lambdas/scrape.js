const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const PRODUCT_ID = 158767;
const SYDNEY_COORDS = [
  [-33.8736064, 151.217141]
  // [-33.5697673, 150.855438],
  // [-33.9370937, 150.976181]
];

const getAvailability = async (productId, [lat, lng]) =>
  await (
    await fetch(
      `https://www.woolworths.com.au/apis/ui/product/${productId}/Stores?IncludeInStockStoreOnly=false&Latitude=${lat}&Longitude=${lng}&Max=100`
    )
  ).json();

const removeDuplicates = arr =>
  arr.reduce(
    (acc, curr) =>
      !acc.find(dup => dup.Store.StoreNo === curr.Store.StoreNo)
        ? acc.concat(curr)
        : acc,
    []
  );

module.exports.handler = async event => {
  const lastUpdatedAt = Date.now();

  const scrapePromises = SYDNEY_COORDS.map(coords =>
    getAvailability(PRODUCT_ID, coords)
  );

  const allStores = await Promise.all(scrapePromises);
  console.log('allStores', allStores.flat().length);
  const stores = removeDuplicates(allStores.flat());
  console.log('stores', stores.length);

  try {
    stores.forEach(({ Store, InstoreIsAvailable }) => {
      const params = {
        TableName: 'coronasupplies',
        Item: {
          ProductType: 'ToiletPaper',
          'StoreNo#ProductID': `${Store.StoreNo}#${PRODUCT_ID}`,
          storeName: Store.Name,
          chain: 'Woolworths',
          lat: Store.Latitude,
          lng: Store.Longitude,
          isAvailableInStore: InstoreIsAvailable,
          lastUpdatedAt
        }
      };
      // Don't `await`, no point in yeilding the thread
      // Promise microtasks will run before execution ends
      dynamodb.put(params).promise();
    });

    console.log(
      `Scraped ${stores.length} stores successfully at ${new Date(
        lastUpdatedAt
      )}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Scraped ${stores.length} stores successfully at ${new Date(
          lastUpdatedAt
        )}`
      })
    };
  } catch (err) {
    console.log('Error:', err);
    return {
      statusCode: err.statusCode || 501,
      headers: { 'Content-Type': 'text/plain' },
      body: "Couldn't update database."
    };
  }
};
