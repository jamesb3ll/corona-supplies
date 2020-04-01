const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.get = async event => {
  try {
    const { Items } = await dynamodb
      .query({
        TableName: 'coronasupplies',
        KeyConditionExpression: 'ProductType = :type',
        ExpressionAttributeValues: {
          ':type': 'ToiletPaper'
        }
      })
      .promise();

    // Format data into a more logical/readable output
    const stores = Items.reduce((acc, curr) => {
      const [storeId, productId] = curr['StoreNo#ProductID'].split('#');
      const existingStore = acc.find(({ store }) => store.id === storeId);
      if (existingStore) {
        existingStore.products.push({
          productId,
          isAvailableInStore: curr.isAvailableInStore
        });
        existingStore.isAvailableInStore =
          existingStore.isAvailableInStore || curr.isAvailableInStore;
      } else {
        acc.push({
          store: {
            id: storeId,
            name: curr.storeName,
            chain: curr.chain,
            lat: curr.lat,
            lng: curr.lng
          },
          products: [
            {
              productId,
              isAvailableInStore: curr.isAvailableInStore
            }
          ],
          isAvailableInStore: curr.isAvailableInStore
        });
      }
      return acc;
    }, []);

    return {
      statusCode: 200,
      body: JSON.stringify({ stores })
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: err.statusCode || 501,
      headers: { 'Content-Type': 'text/html' },
      body: `<details><summary>Couldn't access database.</summary><br/><br/>${err}</details>`
    };
  }
};
