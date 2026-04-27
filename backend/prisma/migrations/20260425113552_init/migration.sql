-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATIONS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT 'ENQUIRY',
    "isArchived" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "FreightForwarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "enquiryDate" DATETIME,
    "noOfPackages" INTEGER,
    "consigneeName" TEXT,
    "shipperName" TEXT,
    "agent" TEXT,
    "sellingRate" DECIMAL,
    "weight" DECIMAL,
    "nominationDate" DATETIME,
    "bookingDate" DATETIME,
    "etd" DATETIME,
    "eta" DATETIME,
    "mawb" TEXT,
    "hawb" TEXT,
    "awbDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FreightForwarding_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CHA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "jobNo" TEXT,
    "checklistDate" DATETIME,
    "checklistApprovalDate" DATETIME,
    "boeNo" TEXT,
    "boeDate" DATETIME,
    "doCollectionDate" DATETIME,
    "status" TEXT,
    "oocDate" DATETIME,
    "gatePassDate" DATETIME,
    "deliveryDate" DATETIME,
    "trackingNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CHA_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" DATETIME,
    "sendingDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Accounts_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_refNo_key" ON "Shipment"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "FreightForwarding_shipmentId_key" ON "FreightForwarding"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CHA_shipmentId_key" ON "CHA"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_shipmentId_key" ON "Accounts"("shipmentId");
