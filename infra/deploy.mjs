import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const profile = process.env.AWS_PROFILE || 'kupac';
const env = { ...process.env, AWS_PROFILE: profile, AWS_PAGER: '', TF_VAR_aws_profile: profile };

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`);
  return capture ? result.stdout.trim() : undefined;
}

function aws(args, capture = false) {
  return run('aws', [...args, '--profile', profile, '--no-cli-pager'], capture);
}

// Fail before changing infrastructure if credentials/account/certificate are wrong.
const identity = JSON.parse(aws(['sts', 'get-caller-identity', '--output', 'json'], true));
if (identity.Account !== '366950153268') throw new Error(`Unexpected AWS account: ${identity.Account}`);
const certificateArn = process.env.TF_VAR_acm_certificate_arn
  || 'arn:aws:acm:us-east-1:366950153268:certificate/eae9b4d5-8346-4a57-8901-1b2d6d534c78';
const certificate = JSON.parse(aws([
  'acm', 'describe-certificate', '--region', 'us-east-1',
  '--certificate-arn', certificateArn, '--output', 'json',
], true)).Certificate;
if (certificate.Status !== 'ISSUED' || !certificate.SubjectAlternativeNames.includes('*.dev.kupac.org')) {
  throw new Error('An issued ACM certificate covering *.dev.kupac.org is required');
}

run('npm', ['run', 'build']);
const terraform = args => run('terraform', ['-chdir=infra', ...args]);
terraform(['init', '-input=false', `-backend-config=profile=${profile}`]);
terraform(['fmt', '-check']);
terraform(['validate']);
terraform(['plan', '-input=false', '-out=deploy.tfplan']);
terraform(['apply', '-input=false', 'deploy.tfplan']);

const apps = JSON.parse(run('terraform', ['-chdir=infra', 'output', '-json', 'apps'], true));
const invalidations = [];
for (const [app, target] of Object.entries(apps)) {
  // Upload hashed assets first. Keep older hashes for open tabs during releases.
  // index.html is always replaced so its Cache-Control cannot remain stale.
  aws(['s3', 'sync', `${app}/dist/`, `s3://${target.bucket}/`,
    '--exclude', 'index.html', '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors']);
  aws(['s3', 'cp', `${app}/dist/index.html`, `s3://${target.bucket}/index.html`,
    '--content-type', 'text/html; charset=utf-8', '--cache-control', 'no-cache', '--only-show-errors']);
  const invalidation = JSON.parse(aws(['cloudfront', 'create-invalidation',
    '--distribution-id', target.distribution_id, '--paths', '/*', '--output', 'json'], true));
  invalidations.push({ target, id: invalidation.Invalidation.Id });
  console.log(`Uploaded ${app}: ${target.url}`);
}
for (const { target, id } of invalidations) {
  console.log(`Waiting for CloudFront invalidation: ${target.url}`);
  aws(['cloudfront', 'wait', 'invalidation-completed',
    '--distribution-id', target.distribution_id, '--id', id]);
}
run('node', ['infra/verify.mjs']);
