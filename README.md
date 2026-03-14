# Lambdator

A serverless Discord bot running on AWS Lambda, deployed with Terraform and GitHub Actions.

Interactions flow through an HTTP API Gateway endpoint into a Lambda function. There is no always-on process — you only pay when commands are actually invoked (effectively free at low volume).

---

## Structure

```
lambdator/
├── lambda/
│   ├── index.mjs                  # Lambda handler — signature verification + command routing
│   ├── helloasso.mjs              # HelloAsso OAuth2 client and API calls
│   └── package.json               # Runtime dependencies
├── scripts/
│   └── register-commands.mjs      # One-shot script to register slash commands with Discord
├── terraform/
│   ├── bootstrap/
│   │   └── main.tf                # Creates S3 bucket, DynamoDB table, and GitHub Actions IAM role
│   ├── main.tf                    # Core infra: Lambda, IAM role, HTTP API Gateway
│   ├── providers.tf               # AWS + archive providers, S3 remote backend declaration
│   ├── variables.tf               # Input variables (region, project name, secrets)
│   └── outputs.tf                 # Prints the Interactions Endpoint URL after deploy
└── .github/workflows/
    └── deploy.yml                 # CI: install deps → terraform apply → register commands
```

### Available commands

| Command | Options | Description |
|---|---|---|
| `/hello` | — | Greets the user |
| `/helloasso` | `action: info` | Fetches and displays organization information from the HelloAsso API |

### Request flow

```
User types a slash command in Discord
        │
        ▼
Discord POSTs to API Gateway  (POST /discord)
        │
        ▼
Lambda verifies Ed25519 signature
        │
        ▼
Lambda routes the command and returns a JSON response
        │
        ▼
Discord displays the bot reply in the channel
```

---

## Bootstrap (first-time setup)

### 1. Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- [Node.js](https://nodejs.org) ≥ 20
- AWS CLI configured with credentials that can create IAM, Lambda, API Gateway, S3, and DynamoDB resources
- A Discord application created at [discord.com/developers](https://discord.com/developers/applications)
- A HelloAsso application with OAuth2 credentials

### 2. Create the Terraform state backend

The bootstrap config creates the S3 bucket, DynamoDB lock table, and GitHub Actions IAM role. It uses a local backend so it has no chicken-and-egg dependency.

```bash
cd terraform/bootstrap
terraform init
terraform apply -var="github_repo=your-org/lambdator"
```

Note the three output values — you will need them in step 3:

```
tf_state_bucket         = "lambdator-tf-state"
tf_state_lock_table     = "lambdator-tf-lock"
github_actions_role_arn = "arn:aws:iam::123456789:role/lambdator-github-actions"
```

### 3. Configure GitHub repository settings

In your GitHub repository go to **Settings → Secrets and variables → Actions**, select the `R-B` environment, and add the following.

**Secrets:**

| Name | Where to find it |
|---|---|
| `AWS_ROLE_ARN` | `github_actions_role_arn` output from the bootstrap step |
| `DISCORD_PUBLIC_KEY` | Discord Developer Portal → your app → General Information |
| `DISCORD_APP_ID` | Discord Developer Portal → your app → General Information |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → your app → Bot → Reset Token |
| `HELLOASSO_CLIENT_ID` | HelloAsso developer portal → your application |
| `HELLOASSO_CLIENT_SECRET` | HelloAsso developer portal → your application |

**Variables:**

| Name | Example value |
|---|---|
| `AWS_REGION` | `eu-west-3` |
| `TF_STATE_BUCKET` | `lambdator-tf-state` (from step 2) |
| `TF_STATE_LOCK_TABLE` | `lambdator-tf-lock` (from step 2) |
| `HELLOASSO_ORGANIZATION_SLUG` | `my-organization` |

> **IAM role for GitHub Actions**
> The CI workflow uses OIDC — no long-lived access keys are stored in GitHub. The role and its OIDC trust policy are created automatically by the bootstrap step above.

### 4. Run the first deployment

Push to `main` (or trigger the workflow manually via **Actions → Deploy → Run workflow**). The workflow will:

1. Install Lambda runtime dependencies
2. Run `terraform apply` to create all AWS resources
3. Register slash commands with Discord
4. Print the **Interactions Endpoint URL**

### 5. Register the endpoint with Discord

Copy the URL printed at the end of the workflow run and paste it into:

**Discord Developer Portal → your app → General Information → Interactions Endpoint URL**

Click **Save Changes**. Discord will send a `PING` to verify the endpoint before accepting it.

---

## Deploying an update

### Updating bot logic

Edit [lambda/index.mjs](lambda/index.mjs) or [lambda/helloasso.mjs](lambda/helloasso.mjs), commit, and push to `main`. The CI workflow runs automatically and redeploys the Lambda function with the new code.

### Adding a new slash command

1. Add the command handler inside the `APPLICATION_COMMAND` block in [lambda/index.mjs](lambda/index.mjs).
2. Add the command definition to the `commands` array in [scripts/register-commands.mjs](scripts/register-commands.mjs).
3. Commit and push to `main`.

The CI workflow will deploy the new handler and re-register all commands with Discord in one step. Global command propagation can take up to one hour.

### Adding a new HelloAsso action

1. Export a new function from [lambda/helloasso.mjs](lambda/helloasso.mjs).
2. Add a new `if (action === '...')` branch in the `helloasso` command handler in [lambda/index.mjs](lambda/index.mjs).
3. Add a new entry to the `choices` array for the `action` option in [scripts/register-commands.mjs](scripts/register-commands.mjs).
4. Commit and push to `main`.

### Updating infrastructure

Edit any file under [terraform/](terraform/), commit, and push to `main`. The workflow runs `terraform plan` followed by `terraform apply` on every push so infrastructure and code are always deployed together.
