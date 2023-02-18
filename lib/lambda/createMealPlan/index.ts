import * as AWS from "aws-sdk";
const { v4: uuid } = require("uuid");

export async function handler(event: any) {
  try {
    if (!process.env.dynamoDbTableName) {
      throw new Error("tableName is missing");
    }

    const dynamoDb = new AWS.DynamoDB.DocumentClient();
    const { data: eventData } = JSON.parse(event.body);

    const id = uuid();

    const inputParams = {
      id: id,
      empId: eventData.empId,
      mealType: eventData.mealType,
      mealPreperation: eventData?.mealPreperation,
      mealSize: eventData?.mealSize,
      isActive: true,
      isNotficiastionSent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const params = {
      TableName: process.env.dynamoDbTableName,
      Item: inputParams,
    };

    await dynamoDb.put(params).promise();

    console.log(JSON.stringify(event));
  } catch (error) {
    console.error(error);
    throw new Error();
  }
}
