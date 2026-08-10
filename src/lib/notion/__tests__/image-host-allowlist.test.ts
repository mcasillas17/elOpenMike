import { describe, it, expect } from "vitest";
import {
  assertSafeImageUrl,
  isAllowedImageHost,
  type AddressResolver,
} from "@/lib/notion/image-url";

// `.amazonaws.com` is not a service. It is the whole of AWS.
//
// The sync fetches whatever url a Notion image block carries, and an `external`
// block's url is whatever anyone with edit access to the page pasted. Allowing
// every host under `.amazonaws.com` therefore pointed the runner at every AWS
// service anybody has ever put behind a hostname: an API Gateway stage
// (`<id>.execute-api.<region>.amazonaws.com`), an EC2 instance's public name
// (`ec2-<ip>.compute-1.amazonaws.com`), a Lambda function url, an SQS queue, an
// Elasticsearch domain. Every one of them is a public address, so the
// resolver's private-range check waves them through, and each is a request the
// runner makes carrying whatever the environment attaches to it — into a repo,
// as an "image".
//
// Notion serves image bytes from S3 and from nowhere else under that domain, so
// only S3's own endpoint shapes are allowed: virtual-hosted regional, the
// legacy dash spelling of the same, path-style regional, and the legacy global
// endpoint. Anything else under `.amazonaws.com` is another service.

const resolvesTo =
  (address: string): AddressResolver =>
  async () =>
    [address];

const publicResolver = resolvesTo("52.219.100.1");

// The shapes Notion's own urls take, and the rest of S3's endpoint spellings.
const S3_HOSTS = [
  // Virtual-hosted, regional: what a signed Notion file url uses today.
  "prod-files-secure.s3.us-west-2.amazonaws.com",
  "prod-files-secure.s3.eu-central-1.amazonaws.com",
  "s3.us-west-2.amazonaws.com",
  "s3.ap-southeast-2.amazonaws.com",
  // A bucket name with dots in it is several labels.
  "secure.notion-static.com.s3.us-west-2.amazonaws.com",
  // The legacy dash spelling of the regional endpoint.
  "prod-files-secure.s3-us-west-2.amazonaws.com",
  "s3-eu-west-1.amazonaws.com",
  // The legacy global endpoint, with and without a bucket in front of it.
  "s3.amazonaws.com",
  "secure.notion-static.com.s3.amazonaws.com",
  // Government and China partitions still spell a region the same way.
  "prod-files-secure.s3.us-gov-west-1.amazonaws.com",
  "prod-files-secure.s3.cn-north-1.amazonaws.com",
];

// Every one of these is a public host somebody can stand up, and none of them
// serves a Notion image.
const OTHER_AWS = [
  "abc123.execute-api.us-east-1.amazonaws.com",
  "ec2-52-1-2-3.compute-1.amazonaws.com",
  "ec2-52-1-2-3.us-west-2.compute.amazonaws.com",
  "lambda.us-east-1.amazonaws.com",
  "sqs.us-east-1.amazonaws.com",
  "sns.eu-west-1.amazonaws.com",
  "dynamodb.us-east-1.amazonaws.com",
  "secretsmanager.us-east-1.amazonaws.com",
  "sts.amazonaws.com",
  "iam.amazonaws.com",
  "search-mydomain.us-east-1.es.amazonaws.com",
  "mydb.abcdef.us-east-1.rds.amazonaws.com",
  "amazonaws.com",
  "evil.amazonaws.com",
];

// Names built to read like an S3 endpoint without being one.
const DECEPTIVE = [
  "prod-files-secure.s3.us-west-2.amazonaws.com.evil.example",
  "s3.us-west-2.amazonaws.com.evil.example",
  "evil-s3.us-west-2.amazonaws.com",
  "s3x.us-west-2.amazonaws.com",
  "xs3.amazonaws.com",
  "nots3.amazonaws.com",
  "s3.us-west-2.evil-amazonaws.com",
  "s3.us-west-2.amazonaws.com.s3.evil.example",
  "s3-.amazonaws.com",
  "s3-notaregion.amazonaws.com",
  "s3..amazonaws.com",
  ".s3.us-west-2.amazonaws.com",
  "bucket..s3.us-west-2.amazonaws.com",
  "BUCKET_NAME.s3.us-west-2.amazonaws.com",
];

describe("the AWS hosts an image may come from", () => {
  it.each(S3_HOSTS)("accepts %s", (host) => {
    expect(isAllowedImageHost(host)).toBe(true);
  });

  it.each(S3_HOSTS)("accepts %s through the whole url check", async (host) => {
    await expect(
      assertSafeImageUrl(`https://${host}/bucket/photo.png`, publicResolver),
    ).resolves.toBeInstanceOf(URL);
  });

  it.each(OTHER_AWS)("refuses %s, which is another AWS service", (host) => {
    expect(isAllowedImageHost(host)).toBe(false);
  });

  it.each(OTHER_AWS)("refuses %s through the whole url check", async (host) => {
    await expect(
      assertSafeImageUrl(`https://${host}/photo.png`, publicResolver),
    ).rejects.toThrow(/host/i);
  });

  it.each(DECEPTIVE)("refuses %s, which only looks like S3", (host) => {
    expect(isAllowedImageHost(host)).toBe(false);
  });

  it("refuses an AWS service however the name is cased", () => {
    expect(isAllowedImageHost("ABC.EXECUTE-API.US-EAST-1.AMAZONAWS.COM")).toBe(
      false,
    );
    expect(isAllowedImageHost("PROD-FILES-SECURE.S3.US-WEST-2.AMAZONAWS.COM")).toBe(
      true,
    );
  });
});

describe("the hosts Notion serves images from that are not AWS", () => {
  const NOTION = [
    "www.notion.so",
    "notion.so",
    "file.notion.so",
    "s3.us-west-2.notion.so",
    "secure.notion-static.com",
    "images.unsplash.com",
  ];

  it.each(NOTION)("still accepts %s", (host) => {
    expect(isAllowedImageHost(host)).toBe(true);
  });

  it.each(["evil-notion.so", "notnotion.so", "notion.so.evil.example"])(
    "still refuses %s",
    (host) => {
      expect(isAllowedImageHost(host)).toBe(false);
    },
  );
});

// The host allowlist is one gate of several, and narrowing it must not have
// taken any of the others away.
describe("the checks that run beside the host list", () => {
  it("still refuses an allowed S3 host that resolves to a private address", async () => {
    await expect(
      assertSafeImageUrl(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a.png",
        resolvesTo("169.254.169.254"),
      ),
    ).rejects.toThrow(/non-public/i);
  });

  it("still refuses a redirect target that is another AWS service", async () => {
    await expect(
      assertSafeImageUrl(
        "https://abc.execute-api.us-east-1.amazonaws.com/prod/whoami",
        publicResolver,
      ),
    ).rejects.toThrow(/host/i);
  });

  it("still refuses plain HTTP to an allowed S3 host", async () => {
    await expect(
      assertSafeImageUrl(
        "http://prod-files-secure.s3.us-west-2.amazonaws.com/a.png",
        publicResolver,
      ),
    ).rejects.toThrow(/https/i);
  });

  it("still refuses credentials on an allowed S3 host", async () => {
    await expect(
      assertSafeImageUrl(
        "https://user:pass@prod-files-secure.s3.us-west-2.amazonaws.com/a.png",
        publicResolver,
      ),
    ).rejects.toThrow(/credentials/i);
  });
});
