import * as AWS from "aws-sdk";

export async function handler(event: any) {
  try {
    if (!process.env.dynamoDbTableName) {
      throw new Error("tableName is missing");
    }

    const dynamoDb = new AWS.DynamoDB.DocumentClient();
    const { data: eventData } = JSON.parse(event.body);

    const params = {
      TableName: process.env.dynamoDbTableName,
      Key: {
        id: eventData.id,
      },
      UpdateExpression: `isAvtive = :isAvtive, updatedAt = :updatedAt`,
      ExpressionAttributeValues: {
        ":isAvtive": false,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    };

    await dynamoDb.update(params).promise();
  } catch (error) {
    console.error(error);
    throw new Error();
  }
}
