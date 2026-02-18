# Continue Leads — Milestone 1 Deployment Guide

## What you're about to do

1. Create a GitHub repo and push the monorepo code
2. Deploy the CloudFormation stack to create all AWS staging infrastructure
3. Run the database migration against staging RDS
4. Verify everything works

Total time: ~30-45 minutes (most of it is waiting for AWS to create resources)

---

## PART A: GitHub Setup (5 minutes)

### Step 1: Create the GitHub repo

1. Go to https://github.com/new
2. Repository name: `continue-leads`
3. Visibility: **Private**
4. Do NOT check any boxes (no README, no .gitignore, no license)
5. Click "Create repository"

### Step 2: Extract and push the code

Open your terminal and run these commands:

```bash
# Navigate to where you downloaded the tar.gz
cd ~/Downloads

# Extract the monorepo
tar -xzf continue-leads-monorepo.tar.gz

# Enter the directory
cd continue-leads

# Initialize git and push
git init
git add .
git commit -m "feat: monorepo scaffold with full schema, shared contracts, and docs"
git branch -M main
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/continue-leads.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

If you use HTTPS instead of SSH:
```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/continue-leads.git
```

### Step 3: Verify CI is green

1. Go to your repo on GitHub
2. Click the "Actions" tab
3. You should see a workflow running
4. Wait for it to complete — it may fail on the first run because pnpm lockfile doesn't exist yet

If CI fails, run this locally first:
```bash
# Install dependencies (creates the lockfile)
pnpm install

# Commit the lockfile
git add pnpm-lock.yaml
git commit -m "chore: add pnpm lockfile"
git push
```

---

## PART B: Install AWS CLI (if not already installed)

### Mac:
```bash
brew install awscli
```

### Or download from: https://aws.amazon.com/cli/

### Configure AWS CLI:
```bash
aws configure
```
Enter:
- AWS Access Key ID: (create one in IAM → Users → thiago-admin → Security credentials → Create access key)
- AWS Secret Access Key: (shown when you create the key)
- Default region: `us-east-1`
- Default output format: `json`

---

## PART C: Deploy CloudFormation Stack (15-20 minutes)

### Step 1: Choose your passwords

You need two secrets before deploying:
- **DB Password**: at least 12 characters, letters + numbers + symbols (example: `CL-Stg-DB#2026!secure`)
- **Admin Auth Secret**: at least 16 characters (example: `cl-admin-auth-secret-2026-staging-key`)

Write these down in your password manager. You'll need the DB password if you ever connect to the database directly.

### Step 2: Deploy the stack

From the `continue-leads` directory:

```bash
aws cloudformation create-stack \
  --stack-name cl-staging \
  --template-body file://infra/cloudformation/milestone1-staging.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=staging \
    ParameterKey=DBMasterPassword,ParameterValue='YOUR_DB_PASSWORD_HERE' \
    ParameterKey=AdminAuthSecret,ParameterValue='YOUR_AUTH_SECRET_HERE' \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

Replace `YOUR_DB_PASSWORD_HERE` and `YOUR_AUTH_SECRET_HERE` with your chosen values.

### Step 3: Wait for completion

This takes 10-15 minutes (RDS is the slowest part). Monitor progress:

```bash
# Check status (run repeatedly or watch)
aws cloudformation describe-stacks \
  --stack-name cl-staging \
  --query 'Stacks[0].StackStatus' \
  --region us-east-1

# Or watch events in real-time
aws cloudformation describe-stack-events \
  --stack-name cl-staging \
  --region us-east-1 \
  --query 'StackEvents[0:5].[ResourceType,LogicalResourceId,ResourceStatus]' \
  --output table
```

Wait until status shows `CREATE_COMPLETE`.

If it shows `ROLLBACK_COMPLETE` or `CREATE_FAILED`, check what failed:
```bash
aws cloudformation describe-stack-events \
  --stack-name cl-staging \
  --region us-east-1 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

### Step 4: Get the outputs (you'll need these later)

```bash
aws cloudformation describe-stacks \
  --stack-name cl-staging \
  --query 'Stacks[0].Outputs' \
  --region us-east-1 \
  --output table
```

Save this output — it contains your RDS endpoint, KMS key ID, S3 bucket name, ECS cluster name, and all other resource IDs needed for Milestone 2.

---

## PART D: Run Database Migration (5 minutes)

The RDS instance is in a private subnet (not accessible from the internet). To run migrations, you have two options:

### Option 1: Temporary bastion (recommended for first-time setup)

```bash
# Get your VPC and subnet IDs from CloudFormation outputs
VPC_ID=$(aws cloudformation describe-stacks --stack-name cl-staging --query 'Stacks[0].Outputs[?OutputKey==`VPCId`].OutputValue' --output text --region us-east-1)
SUBNET_ID=$(aws cloudformation describe-stacks --stack-name cl-staging --query 'Stacks[0].Outputs[?OutputKey==`PublicSubnet1Id`].OutputValue' --output text --region us-east-1)
APP_SG=$(aws cloudformation describe-stacks --stack-name cl-staging --query 'Stacks[0].Outputs[?OutputKey==`AppSecurityGroupId`].OutputValue' --output text --region us-east-1)
RDS_ENDPOINT=$(aws cloudformation describe-stacks --stack-name cl-staging --query 'Stacks[0].Outputs[?OutputKey==`RDSEndpoint`].OutputValue' --output text --region us-east-1)

echo "VPC: $VPC_ID"
echo "Subnet: $SUBNET_ID"
echo "App SG: $APP_SG"
echo "RDS: $RDS_ENDPOINT"
```

Use AWS CloudShell or an ECS task to run the migration. The simplest approach for a one-time migration:

```bash
# From a machine that can reach the RDS (e.g., an EC2 instance in the VPC, or ECS task)
PGPASSWORD='YOUR_DB_PASSWORD' psql \
  -h $RDS_ENDPOINT \
  -U cladmin \
  -d continueleads \
  -f packages/db/migrations/0001_init.sql

PGPASSWORD='YOUR_DB_PASSWORD' psql \
  -h $RDS_ENDPOINT \
  -U cladmin \
  -d continueleads \
  -f packages/db/migrations/0002_seed_launch_data.sql
```

### Option 2: Run migration via ECS task (cleaner, used in CI/CD later)

This will be the production approach. For now, Option 1 is faster for initial setup.

---

## PART E: Verify Milestone 1 (5 minutes)

Run through the manual verification checklist:

1. **AWS Console** → confirm MFA enabled on root user ✓ (already done)
2. **RDS connectivity** → connect from within VPC, run `SELECT now();`
3. **Extensions** → run `SELECT * FROM pg_extension;` — confirm `pgcrypto` and `btree_gist`
4. **Tables** → run `\dt` — confirm all core tables exist
5. **Seed data** → run `SELECT name, slug FROM metros;` — confirm 5 metros
6. **Seed data** → run `SELECT name, slug FROM verticals;` — confirm 3 verticals
7. **KMS** → AWS Console → KMS → confirm key `alias/cl-stg-pii` exists
8. **S3** → AWS Console → S3 → confirm bucket `cl-stg-sites-768499314735` exists
9. **ECS** → AWS Console → ECS → confirm cluster `cl-stg-cluster` exists
10. **CI** → GitHub → Actions → confirm pipeline is green

If all 10 checks pass: **Milestone 1 is complete.** Move to Milestone 2.

---

## Troubleshooting

### "Stack creation failed"
- Most common cause: DB password doesn't meet complexity requirements
- Check the failed event for the specific error message
- Delete the failed stack: `aws cloudformation delete-stack --stack-name cl-staging --region us-east-1`
- Fix the issue and redeploy

### "Can't connect to RDS"
- RDS is in a private subnet — you cannot connect from your local machine
- You need to be inside the VPC (bastion host, CloudShell, or ECS task)

### "Permission denied on CloudFormation"
- Make sure you're using the thiago-admin IAM user
- The `--capabilities CAPABILITY_NAMED_IAM` flag is required because the stack creates IAM roles

### "S3 bucket name already taken"
- S3 bucket names are globally unique. The template uses your account ID to avoid conflicts
- If it still fails, the account ID parameter may need to be updated

---

## What happens next

After Milestone 1 is verified:
- **Milestone 2**: I build the admin dashboard (Next.js + Bootstrap) and deploy it to the ECS cluster
- The CloudFormation outputs (VPC, subnets, security groups, RDS endpoint, etc.) are all exported and ready for Milestone 2's deployment

You don't need to touch AWS again until I need you to verify something.
