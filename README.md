# AWS Serverless Hospital Patient Management System
### Cloud Computing Laboratory Practical Examination Deliverable

A professional, fully functional, serverless hospital patient management system built with vanilla web technologies, Amazon Cognito User Pools, Amazon API Gateway HTTP API, AWS Lambda (Node.js 22.x), Amazon DynamoDB (On-Demand), and AWS Amplify Hosting.

---

## 1. System Architecture

```text
[ Browser / Client ]
  │
  ├── 1. Static Hosting (AWS Amplify Hosting / Local Server)
  │      └── HTML5, CSS3, Vanilla JavaScript (ES Modules)
  │
  ├── 2. Staff Authentication (Amazon Cognito User Pools)
  │      └── USER_PASSWORD_AUTH flow ──> Receives JWT (ID / Access Token)
  │
  └── 3. API Requests (HTTPS with Authorization: Bearer <JWT>)
         │
         ▼
[ Amazon API Gateway (HTTP API v2) ]
  │  └── JWT Authorizer (Validates Issuer & App Client ID against Cognito)
  │
  ├──► Route: /patients, /patients/{id} (GET, POST, PUT, DELETE)
  │       │
  │       ▼
  │   [ AWS Lambda: PatientsFunction ] (Node.js 22.x, Least-Privilege IAM)
  │       │
  │       ▼
  │   [ Amazon DynamoDB: HospitalPatients ] (On-Demand Capacity Mode)
  │
  └──► Route: /appointments, /appointments/{id} (GET, POST, PUT, DELETE)
          │
          ▼
      [ AWS Lambda: AppointmentsFunction ] (Node.js 22.x, Least-Privilege IAM)
          │
          ├──► Validates Patient Existence in HospitalPatients
          ▼
      [ Amazon DynamoDB: HospitalAppointments ] (On-Demand Capacity Mode)
```

---

## 2. Project Directory Structure

```text
hospital-patient-management/
├── public/
│   ├── index.html              # Main Hospital Dashboard, Patients & Appointments UI
│   ├── login.html              # Dedicated Staff Authentication Portal
│   ├── css/
│   │   └── style.css           # Minimalist healthcare theme (responsive, light/blue)
│   └── js/
│       ├── config.js           # Central configuration for AWS endpoints & Cognito IDs
│       ├── auth.js             # Amazon Cognito User Pools client (pure vanilla ES module)
│       ├── api.js              # Authenticated API Gateway client with JWT Bearer tokens
│       ├── patients.js         # Patient CRUD operations, search, and form modals
│       ├── appointments.js     # Appointment scheduling, filtering, and status updates
│       ├── dashboard.js        # Live database metrics calculation (non-hardcoded)
│       └── app.js              # View routing, navigation, and modal dismissal
├── backend/
│   ├── template.yaml           # Complete AWS SAM / CloudFormation Infrastructure as Code
│   ├── package.json            # Node.js 22.x dependencies (@aws-sdk/lib-dynamodb)
│   ├── src/
│   │   ├── dynamoClient.js     # Shared DynamoDB DocumentClient & CORS helpers
│   │   ├── patients.js         # Lambda handler for /patients CRUD
│   │   └── appointments.js     # Lambda handler for /appointments CRUD
│   └── test/
│       ├── test-handlers.js    # Backend test suite (15 automated unit & integration tests)
│       └── verify-frontend.js  # Frontend asset and DOM binding verification script
├── server.js                   # Lightweight zero-dependency local HTTP development server
├── amplify.yml                 # AWS Amplify Hosting build and deployment specification
├── package.json                # Root test and start scripts
├── README.md                   # Complete architectural guide and lab demo manual
└── .gitignore                  # Git ignore rules
```

---

## 3. DynamoDB Primary Key vs. Relational Foreign Key

During a Cloud Computing examination, understanding data modeling differences between relational and NoSQL databases is critical:

| Feature | Relational Database (RDBMS / SQL) | Amazon DynamoDB (NoSQL Key-Value / Document) |
| :--- | :--- | :--- |
| **Primary Key (PK)** | Uniquely identifies a row in a table. Enforced by unique B-Tree or clustered index. | Determines the physical partition (storage node) where the item lives. Read/write operations by PK have single-digit millisecond latency regardless of table size. |
| **Foreign Key (FK)** | A database constraint referencing another table's primary key (`REFERENCES Patients(id)`). The database engine strictly enforces referential integrity, blocking orphaned records and cascading deletes. | **No native engine-level foreign keys exist.** DynamoDB is a non-relational distributed store with no cross-table constraints or `JOIN` operations. |
| **Relationship Implementation** | Enforced at the database engine level across schema definitions. | Handled at the **Application / Business Logic Layer**: In our serverless backend, the `AppointmentsFunction` Lambda handler queries the `HospitalPatients` table (`GetCommand`) to verify the patient exists before creating an appointment. |
| **Query Strategy** | Flexible SQL `JOIN`s, arbitrary `WHERE` filters across columns. | Items are accessed by Partition Key (`patientId`, `appointmentId`) or indexed queries using **Global Secondary Indexes (GSIs)**. |

In our hospital design:
- `HospitalPatients`: Partition key `patientId` (String).
- `HospitalAppointments`: Partition key `appointmentId` (String), with attribute `patientId` stored as a logical foreign key reference, and a Global Secondary Index (`PatientAppointmentsIndex`) on `patientId` (HASH) and `appointmentDate` (RANGE) for fast querying.

---

## 4. Cost Breakdown & Usage-Based Pricing

This application strictly follows AWS Serverless principles: **zero idle compute instances and no fixed monthly charges**.

1. **Amazon DynamoDB (On-Demand Mode `PAY_PER_REQUEST`):**
   - No provisioned read/write capacity units (RCUs/WCUs).
   - Charged only for actual read and write request units consumed:
     - Free Tier: 25 GB of data storage, 2.5 million read request units, 2.5 million write request units per month.
     - Beyond Free Tier: ~$1.25 per million write requests; ~$0.25 per million read requests.
2. **AWS Lambda (Pay-Per-Request):**
   - Free Tier: 1,000,000 free requests and 3.2 million seconds of compute time (400,000 GB-seconds) every month.
   - When idle: **$0.00**.
3. **Amazon API Gateway (HTTP API v2):**
   - HTTP API is up to 71% cheaper than traditional REST APIs.
   - Free Tier: 1,000,000 API calls per month for the first 12 months.
   - Beyond Free Tier: $1.00 per million requests.
4. **Amazon Cognito User Pools:**
   - Free Tier: 50,000 Monthly Active Users (MAUs) permanently free.
   - For a hospital staff of dozens or hundreds of doctors/nurses, Cognito costs **$0.00**.
5. **AWS Amplify Hosting:**
   - Free Tier: 1,000 build minutes per month, 15 GB served per month for the first 12 months.
   - Beyond Free Tier: $0.01 per build minute; $0.15 per GB served; $0.023 per GB storage.

> [!NOTE]
> Serverless usage-based pricing eliminates fixed server costs ($0 when unused). However, in high-volume production, costs scale with requests, outbound data transfer (bandwidth), and long-term DynamoDB backups.

---

## 5. Deployment Guide

### Option A: Deploy via AWS SAM CLI or AWS CloudShell (Recommended)

1. Open the [AWS Management Console](https://console.aws.amazon.com) and open **AWS CloudShell** (or use your local terminal with AWS CLI configured).
2. Clone or upload this project directory.
3. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
4. Build and deploy using AWS SAM:
   ```bash
   sam build
   sam deploy --guided --stack-name hospital-patient-system --capabilities CAPABILITY_IAM
   ```
   *Accept the defaults when prompted.*
5. Note the outputs displayed at the end:
   - `HttpApiEndpoint`: `https://<api-id>.execute-api.<region>.amazonaws.com`
   - `CognitoUserPoolId`: `us-east-1_xxxxxxxxx`
   - `CognitoAppClientId`: `xxxxxxxxxxxxxxxxxxxxxxxxxx`

---

### Option B: Deploy via AWS CloudFormation Console

1. In the AWS Console, open **CloudFormation** -> **Create stack (with new resources)**.
2. Under "Template source", select **Upload a template file** and choose `backend/template.yaml`.
3. Stack name: `hospital-patient-system`.
4. Click **Next** through the parameters.
5. In the final step, check **"I acknowledge that AWS CloudFormation might create IAM resources"** and click **Submit**.
6. Wait ~2 minutes for stack status `CREATE_COMPLETE`.
7. Go to the **Outputs** tab and copy `HttpApiEndpoint`, `CognitoUserPoolId`, and `CognitoAppClientId`.

---

## 6. Staff User Account Creation (Cognito)

Before logging in, create the initial staff account in your Cognito User Pool:

### Via AWS CLI / CloudShell:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username staff@hospital.com \
  --user-attributes Name=email,Value=staff@hospital.com Name=email_verified,Value=true \
  --temporary-password "HospitalStaff123!" \
  --message-action SUPPRESS
```

To set a permanent password immediately:
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username staff@hospital.com \
  --password "HospitalStaff123!" \
  --permanent
```

### Via AWS Management Console:
1. Open **Amazon Cognito** -> Click your User Pool (`hospital-staff-user-pool`).
2. Go to **Users** -> Click **Create user**.
3. Select **Don't send an invitation**.
4. Email address: `staff@hospital.com`.
5. Check **Mark email address as verified**.
6. Set password to `HospitalStaff123!`.
7. Select **Set password as permanent** (or temporary, which tests the built-in new password prompt!).
8. Click **Create user**.

---

## 7. Connecting Frontend to Your AWS Deployment

Open `public/js/config.js` and update the parameters with the outputs from CloudFormation:

```javascript
export const CONFIG = {
  USE_MOCK: false, // Set to false to talk to live AWS

  COGNITO: {
    REGION: 'us-east-1', // Your AWS region
    USER_POOL_ID: 'us-east-1_XXXXXXXXX', // Your User Pool ID
    APP_CLIENT_ID: 'XXXXXXXXXXXXXXXXXXXXXXXXXX' // Your App Client ID (no secret)
  },

  API_BASE_URL: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com'
};
```

> [!TIP]
> **Dynamic Runtime Config:** You can also click **Cloud Settings ⚙️** directly in the top navigation of the web app or login page to paste your endpoints and switch modes without modifying files.

---

## 8. AWS Amplify Hosting Deployment

1. In the AWS Console, open **AWS Amplify** -> **Host a web app**.
2. **Deploy without Git provider** (or connect your GitHub repository):
   - App name: `hospital-patient-management`.
   - Environment name: `production`.
   - Drag and drop the `public/` directory or a `.zip` of `public/`.
   - Click **Save and deploy**.
3. Amplify will provision an SSL-secured HTTPS endpoint: `https://production.xxxx.amplifyapp.com`.
4. Open the Amplify URL in your browser to access the live deployed system.

---

## 9. Local Verification and Testing

### Run Automated Tests (Unit & Integration)
```bash
npm test
```
*Executes all 15 automated tests covering:*
- OPTIONS CORS preflight check.
- Patient creation with required field validation.
- Missing phone/name rejection (400 Bad Request).
- Patient detail retrieval (200 OK) and 404 Not Found handling.
- Patient record update (200 OK).
- Patient listing and live search filtering.
- Rejection of appointments for non-existent patients (foreign key check).
- Rejection of appointments with past dates.
- Scheduling valid appointments for existing patients.
- Filtering appointments by status and date.
- Updating appointment status to `Completed`.
- Deleting appointments and patients from DynamoDB.

### Run Local Development Server
```bash
npm start
```
Open [http://localhost:3000/login.html](http://localhost:3000/login.html) in your browser.

---

## 10. Lab Practical Examination Demonstration Script

Follow this step-by-step sequence to present the project during your examination:

1. **Architecture & Hosting Presentation:**
   - Open the application at the deployed Amplify URL (or `http://localhost:3000/login.html`).
   - Point out that the frontend is a responsive, single-page application built purely with HTML5, CSS3, and vanilla JavaScript ES modules—no heavy frameworks or always-running servers.
2. **Authorized Staff Login:**
   - Attempt to access `index.html` directly: show that the authentication guard immediately redirects unauthenticated users to `login.html`.
   - Enter credentials:
     - Email: `staff@hospital.com`
     - Password: `HospitalStaff123!`
   - Show network tab: Direct HTTPS call to Cognito IDP endpoint (`AWSCognitoIdentityProviderService.InitiateAuth`), receiving a valid Cognito JWT ID and Access Token stored securely in the browser session.
3. **Live Dashboard Metrics:**
   - Point out that all 4 KPI counters (Total Patients, Total Appointments, Today's Appointments, Upcoming Appointments) are computed live from the API response and are **not hardcoded**.
4. **Register Fictional Patient (Create):**
   - Click **+ Register Patient**.
   - Enter fictional details:
     - Full Name: `Eleanor Vance`
     - Phone: `+1-555-0143`
     - DOB: `1984-06-15`
     - Gender: `Female`
     - Blood Group: `A+`
     - Email: `eleanor.vance@example.com`
     - Address: `42 Highland Avenue, Suite 3`
   - Click **Save Patient to DynamoDB**.
   - Observe the success toast, the newly generated unique ID (`PAT-XXXXXX`), and the instant update of the dashboard counter.
5. **View & Search Patients (Read):**
   - Type `Eleanor` in the search bar: show real-time filtering.
   - Click the 👁️ (View Details) button: show the complete patient profile modal with timestamps.
6. **Update Patient Record (Update):**
   - Click the ✏️ (Edit) button on Eleanor's row.
   - Change Phone to `+1-555-9999` and click Save.
   - Show that the phone number persists and updates in the table.
7. **Schedule an Appointment (Create & Foreign Key Check):**
   - Click **+ Schedule Appointment**.
   - Show the patient dropdown: it is populated dynamically from the Patients API. Select `Eleanor Vance`.
   - Test past-date validation: select yesterday's date and observe the clear validation rejection ("Appointment date cannot be in the past").
   - Select a valid future date and time (`10:30 AM`), Doctor `Dr. Sarah Jenkins (Cardiology)`, Reason: `Post-operative consultation`.
   - Click **Save Appointment to DynamoDB**.
8. **Manage Appointment Status (Update):**
   - In the Appointments table, click the ✅ (Complete) action button.
   - Show that the status badge smoothly transitions to green `Completed` and persists.
9. **Delete Record with Confirmation (Delete):**
   - Click the 🗑️ (Delete) button on the appointment row.
   - Show the confirmation dialog warning that this permanently removes the record from DynamoDB.
   - Confirm deletion: row is removed and count badge decrements.
10. **Cloud Verification & Cost Explanation:**
    - Open the **DynamoDB Console** in AWS: show the `HospitalPatients` and `HospitalAppointments` tables containing the exact item attributes.
    - Conclude by explaining the usage-based pricing model: zero idle cost, pay-per-request DynamoDB, and free-tier coverage across Cognito and Lambda.

