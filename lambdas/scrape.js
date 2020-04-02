const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const PRODUCT_IDS = [
  158767,
  677309,
  847655,
  329923,
  67114,
  579597,
  742707,
  847649,
  824151,
  12407,
  752114,
  779551,
  321780,
  722,
  67113,
  938184
];
const SYDNEY_COORDS = [
  [-33.8736064, 151.217141],
  [-33.5697673, 150.855438],
  [-33.9370937, 150.976181]
];

const getProduct = async productId =>
  await (
    await fetch(`https://www.woolworths.com.au/apis/ui/product/${productId}`)
  ).json();

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
  try {
    const allProducts = PRODUCT_IDS.map(async productId => {
      const { Name: productName, MediumImageFile } = await getProduct(
        productId
      );

      const scrapePromises = SYDNEY_COORDS.map(coords =>
        getAvailability(productId, coords)
      );

      const allStores = await Promise.all(scrapePromises);
      console.log('allStores', allStores.flat().length);
      const stores = removeDuplicates(allStores.flat());
      console.log('stores', stores.length);

      await Promise.all(
        stores.map(({ Store, InstoreIsAvailable }) => {
          const params = {
            TableName: 'coronasupplies',
            Item: {
              ProductType: 'ToiletPaper',
              'StoreNo#ProductID': `${Store.StoreNo}#${productId}`,
              storeName: Store.Name,
              chain: 'Woolworths',
              lat: Store.Latitude,
              lng: Store.Longitude,
              isAvailableInStore: InstoreIsAvailable,
              productName,
              MediumImageFile,
              lastUpdatedAt
            }
          };
          // Don't `await`, no point in yeilding the thread
          // Promise microtasks will run before execution ends
          return dynamodb.put(params).promise();
        })
      );
    });

    const products = await Promise.all(allProducts);

    console.log(
      `Scraped ${products.length} products successfully at ${new Date(
        lastUpdatedAt
      )}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Scraped successfully at ${new Date(lastUpdatedAt)}`
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
