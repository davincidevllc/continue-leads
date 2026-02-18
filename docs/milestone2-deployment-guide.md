# Milestone 2 — Admin Dashboard Deployment Guide

## What You're Deploying

| Component | Description |
|-----------|-------------|
| **Admin App** | Next.js dashboard on ECS Fargate behind an ALB |
| **Auth** | Shared-secret login (Thiago-only, ADMIN_AUTH_SECRET) |
| **Pages** | Dashboard, Metros CRUD, Verticals config, Sites CRUD, Leads list+detail |
| **URL** | `http://<ALB-DNS>` (HTTP, staging only) |

**Not in scope:** Content engine, site publishing, ping-post, HTTPS/custom domain.

---

## Prerequisites

✅ Milestone 1 complete (cl-staging stack running, DB migrated)  
✅ GitHub repo: `davincidevllc/continue-leads`  
✅ AWS CLI / CloudShell access  

You need these values from your M1 stack:

```bash
# Run this in CloudShell to get all values at once:
aws cloudformation describe-stacks --stack-name cl-staging \
  --query 'Stacks[0].Outputs' --output table
```

---

## Step 1: Merge Code to Main

Pull the latest code package and push to GitHub:

```bash
# On your Mac, extract the tarball into your repo
cd ~/Downloads
tar xzf milestone2-admin.tar.gz

# Copy into your repo (from the repo root)
cp -r milestone2-admin/apps/admin/* ~/path-to-repo/apps/admin/
cp milestone2-admin/.github/workflows/deploy-admin.yml ~/path-to-repo/.github/workflows/
cp milestone2-admin/infra/cloudformation/milestone2-admin.yaml ~/path-to-repo/infra/cloudformation/

# Commit and push
cd ~/path-to-repo
git add -A
git commit -m "feat: milestone 2 - admin dashboard with auth, CRUD, leads"
git push origin main
```

---

## Step 2: Get Milestone 1 Stack Outputs

In **CloudShell**, run:

```bash
# Get all outputs as a table
aws cloudformation describe-stacks --stack-name cl-staging \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
```

You need these specific values:

| Output Key | Used For | Example |
|-----------|----------|---------|
| `VpcId` | VPC for ALB/ECS | vpc-0abc... |
| `PublicSubnet1` | ALB placement | subnet-0abc... |
| `PublicSubnet2` | ALB placement | subnet-0def... |
| `PrivateSubnet1` | ECS tasks | subnet-0fec... |
| `PrivateSubnet2` | ECS tasks | subnet-0452... |
| `EcsCluster` | ECS cluster ARN | arn:aws:ecs:... |
| `AppSecurityGroup` | App SG with DB access | sg-036... |
| `DbSecretArn` | DB credentials | arn:aws:secretsmanager:... |
| `AppSecretArn` | App secrets | arn:aws:secretsmanager:... |
| `RdsEndpoint` | DB hostname | cl-stg-db.ccpw...rds.amazonaws.com |

**Note:** Your M1 template may not have exported public subnets. If so, find them:

```bash
# List all subnets in your VPC
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=YOUR_VPC_ID" \
  --query 'Subnets[*].[SubnetId,Tags[?Key==`Name`].Value|[0],MapPublicIpOnLaunch]' \
  --output table
```

The subnets with `MapPublicIpOnLaunch = True` are public. If none are public, you'll need to create them — see Appendix A.

---

## Step 3: Deploy CloudFormation Stack

Choose a strong admin password (16+ chars). This is what you'll use to log in.

```bash
# Upload template
aws s3 cp milestone2-admin.yaml s3://cl-stg-sites-768499314735/infra/milestone2-admin.yaml

# Deploy (replace placeholders with your actual values)
aws cloudformation create-stack \
  --stack-name cl-stg-admin \
  --template-url https://cl-stg-sites-768499314735.s3.amazonaws.com/infra/milestone2-admin.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=VpcId,ParameterValue=YOUR_VPC_ID \
    ParameterKey=PublicSubnet1,ParameterValue=YOUR_PUBLIC_SUBNET_1 \
    ParameterKey=PublicSubnet2,ParameterValue=YOUR_PUBLIC_SUBNET_2 \
    ParameterKey=PrivateSubnet1,ParameterValue=YOUR_PRIVATE_SUBNET_1 \
    ParameterKey=PrivateSubnet2,ParameterValue=YOUR_PRIVATE_SUBNET_2 \
    ParameterKey=EcsClusterArn,ParameterValue=YOUR_ECS_CLUSTER_ARN \
    ParameterKey=AppSecurityGroupId,ParameterValue=YOUR_APP_SG_ID \
    ParameterKey=DbSecretArn,ParameterValue=YOUR_DB_SECRET_ARN \
    ParameterKey=AppSecretArn,ParameterValue=YOUR_APP_SECRET_ARN \
    ParameterKey=RdsEndpoint,ParameterValue=YOUR_RDS_ENDPOINT \
    ParameterKey=AdminAuthSecret,ParameterValue='YourStrongPassword16chars!'
```

Wait for completion (~5 min):

```bash
aws cloudformation wait stack-create-complete --stack-name cl-stg-admin
echo "✅ Stack created"

# Get outputs
aws cloudformation describe-stacks --stack-name cl-stg-admin \
  --query 'Stacks[0].Outputs' --output table
```

Save the **AdminUrl** output — that's your dashboard URL.

---

## Step 4: Build & Push Docker Image (First Time)

The CD workflow needs the first image before the ECS service can start. Do this from CloudShell or your local machine:

### Option A: CloudShell (Recommended)

```bash
# Clone repo
git clone https://github.com/davincidevllc/continue-leads.git
cd continue-leads

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  768499314735.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -f apps/admin/Dockerfile -t cl-stg-admin .

# Tag and push
docker tag cl-stg-admin:latest \
  768499314735.dkr.ecr.us-east-1.amazonaws.com/cl-stg-admin:latest

docker push \
  768499314735.dkr.ecr.us-east-1.amazonaws.com/cl-stg-admin:latest
```

### Option B: GitHub Actions (Automated)

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret key |

Then trigger the workflow:

```bash
# Push any change to main, or trigger manually:
gh workflow run deploy-admin.yml
```

---

## Step 5: Force ECS Service Update

After the first image push, force the service to pick it up:

```bash
aws ecs update-service \
  --cluster cl-stg-cluster \
  --service cl-stg-admin \
  --force-new-deployment

# Wait for stable
aws ecs wait services-stable \
  --cluster cl-stg-cluster \
  --services cl-stg-admin
echo "✅ Service is running"
```

---

## Step 6: Verify

### Check ECS task is running

```bash
aws ecs list-tasks --cluster cl-stg-cluster --service-name cl-stg-admin
```

Should return 1 task ARN.

### Check logs

```bash
STREAM=$(aws logs describe-log-streams \
  --log-group-name /ecs/cl-stg-admin \
  --order-by LastEventTime --descending --limit 1 \
  --query 'logStreams[0].logStreamName' --output text)

aws logs get-log-events \
  --log-group-name /ecs/cl-stg-admin \
  --log-stream-name $STREAM \
  --query 'events[*].message' --output text | tail -20
```

Should show Next.js starting on port 3000.

### Hit the URL

Open the **AdminUrl** from Step 3 outputs in your browser:

```
http://cl-stg-admin-alb-XXXXXXXX.us-east-1.elb.amazonaws.com
```

You should see the login page. Enter the `AdminAuthSecret` you chose.

---

## Step 7: Set Up GitHub Secrets for CI/CD

For automatic deploys on push to main:

1. Go to https://github.com/davincidevllc/continue-leads/settings/secrets/actions
2. Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
3. Every push that touches `apps/admin/`, `packages/shared/`, or `packages/db/` auto-deploys

---

## Acceptance Checklist

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | ALB serves HTTP on port 80 | Open AdminUrl in browser |
| 2 | Login page renders | See "Continue Leads" card with password field |
| 3 | Auth rejects wrong password | Enter wrong password → "Invalid password" |
| 4 | Auth accepts correct password | Enter AdminAuthSecret → redirects to dashboard |
| 5 | Dashboard loads | Shows 4 stat cards (leads, today, sites, metros) |
| 6 | Metros CRUD | List 5 seeded metros, edit one, create new, toggle active |
| 7 | Verticals config | List 3 verticals, edit dedupe window, toggle required fields |
| 8 | Sites CRUD | Create site (pick vertical + template + metros), edit status |
| 9 | Leads list + filters | List shows leads (empty is OK), filters work |
| 10 | Lead detail | Click a lead → shows info, status timeline, responses |
| 11 | ECS logs clean | No crash loops in CloudWatch `/ecs/cl-stg-admin` |
| 12 | CD pipeline works | Push to main → image built → service updated |

---

## Troubleshooting

### ECS task won't start / keeps restarting

```bash
# Check stopped tasks for error
aws ecs list-tasks --cluster cl-stg-cluster --service-name cl-stg-admin \
  --desired-status STOPPED

# Get the task ARN and describe it
aws ecs describe-tasks --cluster cl-stg-cluster \
  --tasks TASK_ARN_HERE \
  --query 'tasks[0].{status:lastStatus,reason:stoppedReason,container:containers[0].{exit:exitCode,reason:reason}}'
```

Common issues:
- **"CannotPullContainerError"** → No image in ECR yet. Do Step 4 first.
- **Exit code 1** → App crash. Check CloudWatch logs.
- **"ResourceInitializationError"** → Network issue. Verify private subnets have NAT gateway.

### ALB returns 502/503

- ECS task not healthy yet — wait 60 seconds
- Health check failing — task must respond 200 on `/login`
- Check security groups: ALB SG → port 3000 → App SG

### Can't connect to database

- Verify `AppSecurityGroupId` is the SG that has RDS inbound rules
- Check RDS endpoint is correct
- Check DB_PASSWORD secret is being injected

---

## Appendix A: Creating Public Subnets

If your M1 stack only has private subnets, the ALB needs public ones:

```bash
# Create public subnet 1
aws ec2 create-subnet \
  --vpc-id YOUR_VPC_ID \
  --cidr-block 10.0.10.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cl-stg-public-1}]'

# Create public subnet 2
aws ec2 create-subnet \
  --vpc-id YOUR_VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cl-stg-public-2}]'

# Create Internet Gateway (if not exists)
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=cl-stg-igw}]'

# Attach to VPC
aws ec2 attach-internet-gateway --internet-gateway-id IGW_ID --vpc-id YOUR_VPC_ID

# Create route table for public subnets
aws ec2 create-route-table --vpc-id YOUR_VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=cl-stg-public-rt}]'

# Add default route to IGW
aws ec2 create-route --route-table-id RTB_ID \
  --destination-cidr-block 0.0.0.0/0 --gateway-id IGW_ID

# Associate subnets
aws ec2 associate-route-table --subnet-id SUBNET_1_ID --route-table-id RTB_ID
aws ec2 associate-route-table --subnet-id SUBNET_2_ID --route-table-id RTB_ID

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id SUBNET_1_ID --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id SUBNET_2_ID --map-public-ip-on-launch
```

---

## Appendix B: File Summary

```
New/Changed Files:
├── apps/admin/
│   ├── Dockerfile                          # Multi-stage Docker build
│   ├── next.config.js                      # Standalone output mode
│   ├── package.json                        # Added pg dependency
│   ├── tsconfig.json                       # Added node types
│   └── src/
│       ├── middleware.ts                    # Auth middleware (redirects to /login)
│       ├── lib/
│       │   ├── auth.ts                     # HMAC session tokens, verify password
│       │   └── db.ts                       # All SQL queries for CRUD operations
│       ├── components/
│       │   ├── ui.tsx                       # Nav, StatusBadge, Pagination
│       │   └── AuthLayout.tsx              # Wrapper with nav bar
│       └── app/
│           ├── layout.tsx                  # Root layout with Bootstrap
│           ├── page.tsx                    # Dashboard with stat cards
│           ├── login/page.tsx              # Login form
│           ├── api/auth/login/route.ts     # POST login
│           ├── api/auth/logout/route.ts    # POST logout
│           ├── metros/                     # List, new, [id] edit
│           ├── api/metros/                 # GET, POST, PUT
│           ├── verticals/                  # List, [id] edit
│           ├── api/verticals/[id]/         # GET, PUT
│           ├── sites/                      # List, new, [id] edit
│           ├── api/sites/                  # GET, POST, PUT
│           ├── leads/                      # List, [id] detail
│           └── api/                        # REST endpoints
├── .github/workflows/
│   └── deploy-admin.yml                    # CD: build → ECR → ECS
└── infra/cloudformation/
    └── milestone2-admin.yaml               # ALB, ECR, ECS Service, IAM
```
