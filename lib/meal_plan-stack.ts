import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import {
  aws_dynamodb as dynamo,
  RemovalPolicy,
  aws_stepfunctions as stepFunc,
  aws_stepfunctions_tasks as tasks,
  aws_apigateway as apig,
} from "aws-cdk-lib";
import {
  CompositePrincipal,
  Effect,
  PolicyStatement,
  Role,
  AccountPrincipal,
} from "aws-cdk-lib/aws-iam";
import { responseTemplate } from "./vtl/responseTemplates";

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MealPlanStack extends cdk.Stack {
  public readonly table: dynamo.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamo.Table(this, `mealPlanTable`, {
      partitionKey: {
        name: "id",
        type: dynamo.AttributeType.STRING,
      },
      tableName: "mealPlan",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const createMealPlan = new lambda.Function(this, "createMealPlan", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      code: cdk.aws_lambda.Code.fromAsset(
        path.join(__dirname, "./lambda/createMealPlan"),
        {
          exclude: ["*.ts"],
        }
      ),
      environment: {
        dynamoDbTableName: this.table.tableName,
      },
    });

    const sendNotification = new lambda.Function(
      this,
      "mealPlan-sendNotification",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "./lambda/sendNotification"),
          {
            exclude: ["*.ts"],
          }
        ),
        environment: {
          dynamoDbTableName: this.table.tableName,
        },
      }
    );

    const rollBackMealPlan = new lambda.Function(
      this,
      "mealPlan-rollbackMealPlan",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "./lambda/rollback"),
          {
            exclude: ["*.ts"],
          }
        ),
        environment: {
          dynamoDbTableName: this.table.tableName,
        },
      }
    );

    const api = new cdk.aws_apigateway.RestApi(this, "mealPlan", {
      restApiName: "mealPlanApi",
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
      defaultMethodOptions: {
        authorizationType: cdk.aws_apigateway.AuthorizationType.NONE,
      },
    });

    // api.root.addMethod(
    //   "post",
    //   new cdk.aws_apigateway.LambdaIntegration(createMealPlan)
    // );

    const stateMachine: stepFunc.IStateMachine = new stepFunc.StateMachine(
      this,
      `mealPlan-createMealPlanStateMachine`,
      {
        stateMachineType: stepFunc.StateMachineType.EXPRESS,
        definition: new tasks.LambdaInvoke(this, `mealPlan-createMealPlan`, {
          lambdaFunction: createMealPlan,
          outputPath: "$",
        }).next(
          new stepFunc.Choice(this, `mealPlan-mealPlanSaveFails`)
            .when(
              stepFunc.Condition.stringEquals("$.Payload.status", "Fails"),
              new stepFunc.Fail(this, `mealPlan-saveFails`, {
                error: "Internal server error",
              })
            )
            .when(
              stepFunc.Condition.stringEquals("$.Payload.status", "success"),
              new tasks.LambdaInvoke(this, `mealPlan-sendNotification`, {
                lambdaFunction: sendNotification,
                outputPath: "$",
                inputPath: "$",
              }).next(
                new stepFunc.Choice(this, `mealPlan-NotificationSuccessChoice`)
                  .when(
                    stepFunc.Condition.stringEquals(
                      "$.Payload.status",
                      "success"
                    ),
                    new stepFunc.Succeed(this, `mealPlan-createComplete`)
                  )
                  .when(
                    stepFunc.Condition.booleanEquals(
                      "$.Payload.reqData.isSendNotificationFails",
                      true
                    ),
                    new tasks.LambdaInvoke(this, `mealPlan_rollback`, {
                      lambdaFunction: rollBackMealPlan,
                      outputPath: "$",
                      inputPath: "$",
                    }).next(
                      new stepFunc.Fail(
                        this,
                        `mealPlan-sendNotificationFails`,
                        {
                          error: "send",
                        }
                      )
                    )
                  )
              )
            )
        ),
      }
    );

    api.root.addMethod(
      "POST",
      apig.StepFunctionsIntegration.startExecution(stateMachine, {
        headers: true,
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
            responseTemplates: responseTemplate,
          },
        ],
        authorizer: true,
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type": true,
              "method.response.header.Access-Control-Allow-Origin": true,
              "method.response.header.Access-Control-Allow-Credentials": true,
            },
          },
        ],
      }
    );
  }
}
