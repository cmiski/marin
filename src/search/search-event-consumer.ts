import * as amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { parseIndexingWebhookPayload } from './indexing-events.js';
import { productIndexingService } from './product-indexing-service.js';
import { setupProductIndex } from './setup-indices.js';

export class SearchEventConsumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  public async start(): Promise<void> {
    if (!env.ENABLE_RABBITMQ_CONSUMER) {
      logger.info('RabbitMQ indexing consumer disabled');
      return;
    }

    await setupProductIndex();

    const connection = await amqplib.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    this.connection = connection;
    this.channel = channel;

    await channel.assertQueue(env.RABBITMQ_SEARCH_INDEX_QUEUE, {
      durable: true
    });
    await channel.prefetch(env.RABBITMQ_PREFETCH);
    await channel.consume(
      env.RABBITMQ_SEARCH_INDEX_QUEUE,
      (message) => {
        void this.handleMessage(message);
      },
      {
        noAck: false
      }
    );

    logger.info('RabbitMQ indexing consumer started', {
      queue: env.RABBITMQ_SEARCH_INDEX_QUEUE,
      prefetch: env.RABBITMQ_PREFETCH
    });
  }

  public async stop(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = null;
    this.connection = null;
  }

  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    const channel = this.channel;

    if (message === null || channel === null) {
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as unknown;
      const events = parseIndexingWebhookPayload(payload);
      await productIndexingService.processEvents(events);
      channel.ack(message);
    } catch (error) {
      logger.error('Failed to process RabbitMQ indexing message', {
        error,
        queue: env.RABBITMQ_SEARCH_INDEX_QUEUE
      });
      channel.nack(message, false, false);
    }
  }
}

export const searchEventConsumer = new SearchEventConsumer();
