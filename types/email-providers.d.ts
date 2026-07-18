// Type declarations for optional email provider dependencies
// These modules are only required if the respective Tier 1 provider is configured

declare module '@sendgrid/mail' {
  interface MailDataRequired {
    to: string | string[] | { email: string; name?: string } | { email: string; name?: string }[];
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | { email: string; name?: string };
    attachments?: Array<{
      content: string;
      filename: string;
      type?: string;
      disposition?: string;
    }>;
    customArgs?: Record<string, string>;
    trackingSettings?: {
      clickTracking?: { enable: boolean };
      openTracking?: { enable: boolean };
      subscriptionTracking?: { enable: boolean };
    };
  }

  interface ClientResponse {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
  }

  function setApiKey(key: string): void;
  function send(data: MailDataRequired | MailDataRequired[]): Promise<[ClientResponse, {}]>;
  function sendMultiple(data: MailDataRequired | MailDataRequired[]): Promise<[ClientResponse, {}]>;

  export { MailDataRequired };
  export default { setApiKey, send, sendMultiple };
}

declare module 'mailgun.js' {
  class Mailgun {
    constructor(formData: any);
    client(options: { username: string; key: string; url?: string }): any;
  }
  export default Mailgun;
}

declare module 'mailgun.js/Interfaces' {
  export interface IMailgunClient {
    messages: {
      create(domain: string, data: any): Promise<any>;
    };
    domains: {
      verify(domain: string): Promise<any>;
      get(domain: string): Promise<any>;
      list(): Promise<{ items: any[] }>;
    };
  }
}

declare module '@aws-sdk/client-ses' {
  export class SESClient {
    constructor(config: { region: string; credentials: { accessKeyId: string; secretAccessKey: string } });
    send(command: any): Promise<any>;
    destroy(): void;
  }
  export class SendEmailCommand {
    constructor(input: SendEmailCommandInput);
  }
  export class SendBulkTemplatedEmailCommand {
    constructor(input: SendBulkTemplatedEmailCommandInput);
  }
  export class VerifyEmailIdentityCommand {
    constructor(input: { EmailAddress: string });
  }
  export class GetAccountCommand {
    constructor(input?: {});
  }

  export interface SendEmailCommandInput {
    Source: string;
    Destination: { ToAddresses: string[]; CcAddresses?: string[]; BccAddresses?: string[] };
    Message: {
      Subject: { Data: string; Charset?: string };
      Body: {
        Html?: { Data: string; Charset?: string };
        Text?: { Data: string; Charset?: string };
      };
    };
    ReplyToAddresses?: string[];
    Tags?: Array<{ Name: string; Value: string }>;
  }

  export interface SendBulkTemplatedEmailCommandInput {
    Source: string;
    Template: string;
    DefaultTemplateData: string;
    ReplyToAddresses?: string[];
    Destinations: Array<{
      Destination: { ToAddresses: string[] };
      ReplacementTemplateData?: string;
    }>;
  }
}
