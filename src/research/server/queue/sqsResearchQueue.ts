import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type ReceiveMessageCommandOutput,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { z } from "zod";
import type {
  ResearchDispatchQueue,
  ResearchQueueMessage,
  ResearchWorkSignal,
} from "../../ports/researchQueue";
import type { PublicRun } from "../api/researchApiContracts";

const MessageSchema = z
  .object({
    schemaVersion: z.literal("research-queue-v1"),
    runId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();

type SqsResearchQueueOptions = {
  readonly queueUrl: string;
  readonly region: string;
};

export class SqsResearchQueue
  implements ResearchDispatchQueue, ResearchWorkSignal
{
  readonly #client: SQSClient;

  constructor(private readonly options: SqsResearchQueueOptions) {
    this.#client = new SQSClient({
      region: options.region,
      maxAttempts: 3,
    });
  }

  async enqueue(run: PublicRun): Promise<void> {
    const message: ResearchQueueMessage = {
      schemaVersion: "research-queue-v1",
      runId: run.runId,
      createdAt: run.createdAt,
    };
    await this.#client.send(
      new SendMessageCommand({
        QueueUrl: this.options.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          schemaVersion: {
            DataType: "String",
            StringValue: message.schemaVersion,
          },
        },
      }),
    );
  }

  async wait(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    let response: ReceiveMessageCommandOutput;
    try {
      response = await this.#client.send(
        new ReceiveMessageCommand({
          QueueUrl: this.options.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 60,
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      if (signal.aborted && error instanceof Error) return false;
      throw error;
    }
    const message = response.Messages?.[0];
    if (message === undefined) return false;
    const parsed = parseMessage(message.Body);
    if (parsed === undefined || message.ReceiptHandle === undefined)
      return false;
    await this.#client.send(
      new DeleteMessageCommand({
        QueueUrl: this.options.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
      { abortSignal: signal },
    );
    return true;
  }

  close(): void {
    this.#client.destroy();
  }
}

export function createLiveResearchQueue(): SqsResearchQueue | undefined {
  const { AWS_REGION: region, STOCKSEMBLY_RESEARCH_QUEUE_URL: queueUrl } =
    process.env;
  return region && queueUrl
    ? new SqsResearchQueue({ queueUrl, region })
    : undefined;
}

function parseMessage(
  body: string | undefined,
): ResearchQueueMessage | undefined {
  if (body === undefined) return undefined;
  try {
    return MessageSchema.safeParse(JSON.parse(body)).data;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
