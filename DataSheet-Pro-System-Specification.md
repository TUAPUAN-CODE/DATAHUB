# DataSheet Pro — System Specification Document

> **Version:** 1.0.0  
> **Status:** Draft  
> **Last Updated:** 2026-09-30  
> **Tech Stack:** React · Node.js · SQL Server (SSMS)

---

## สารบัญ (Table of Contents)

1. [ภาพรวมระบบ (System Overview)](#1-ภาพรวมระบบ)
2. [สถาปัตยกรรมระบบ (System Architecture)](#2-สถาปัตยกรรมระบบ)
3. [โครงสร้างฐานข้อมูล (Database Schema)](#3-โครงสร้างฐานข้อมูล)
4. [ระบบจัดการผู้ใช้และบทบาท (User & Role Management)](#4-ระบบจัดการผู้ใช้และบทบาท)
5. [ระบบจัดการโฟลเดอร์และไฟล์ (Folder & File Management)](#5-ระบบจัดการโฟลเดอร์และไฟล์)
6. [ระบบสร้างเอกสาร/ฟอร์ม (Document Builder)](#6-ระบบสร้างเอกสารฟอร์ม)
7. [ระบบ Table & Spreadsheet](#7-ระบบ-table--spreadsheet)
8. [ระบบสิทธิ์การเข้าถึง (Access Control)](#8-ระบบสิทธิ์การเข้าถึง)
9. [ระบบ Audit Log & Data Rollback](#9-ระบบ-audit-log--data-rollback)
10. [ระบบ Dashboard & Chart Builder](#10-ระบบ-dashboard--chart-builder)
11. [ระบบ UI Customization](#11-ระบบ-ui-customization)
12. [ระบบ Favorites & Search](#12-ระบบ-favorites--search)
13. [UI/UX Design Specification](#13-uiux-design-specification)
14. [API Specification](#14-api-specification)
15. [Flow Diagrams](#15-flow-diagrams)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Deployment & DevOps](#17-deployment--devops)
18. [Development Phases](#18-development-phases)

---

## 1. ภาพรวมระบบ

### 1.1 วัตถุประสงค์

DataSheet Pro คือ Web Application สำหรับจัดการข้อมูลแบบ Spreadsheet ที่รองรับการสร้างฟอร์มเอกสารแบบ Dynamic, ระบบจัดการสิทธิ์การเข้าถึง, ระบบ Audit Trail, และ Dashboard Builder — ครอบคลุมความสามารถของ Google Sheets + SharePoint + Power BI ในแพลตฟอร์มเดียว

### 1.2 กลุ่มผู้ใช้งาน

| บทบาท | คำอธิบาย | สิทธิ์หลัก |
|--------|----------|-----------|
| **User** | ผู้ใช้งานทั่วไป | กรอก/แก้ไขข้อมูลในไฟล์ที่ได้รับสิทธิ์, ดู Dashboard, ติดดาว Favorites |
| **Master** | ผู้จัดการฟอร์ม | สร้าง/แก้ไขฟอร์มเอกสาร, จัดการโฟลเดอร์ที่ตัวเองสร้างหรือมีสิทธิ์, กำหนดสิทธิ์ไฟล์ในขอบเขตของตัวเอง |
| **Admin** | ผู้ดูแลระบบ | ทำได้ทุกอย่าง: จัดการ User, สิทธิ์ทั้งหมด, ตั้งค่าระบบ, ดู Audit Log ทั้งหมด |

### 1.3 Core Features Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    DataSheet Pro Platform                     │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Folder &    │  Document    │  Spreadsheet │  Dashboard     │
│  File Mgmt   │  Builder     │  Engine      │  Builder       │
├──────────────┼──────────────┼──────────────┼────────────────┤
│  Access      │  Audit Log   │  User Mgmt   │  UI            │
│  Control     │  & Rollback  │  & Roles     │  Customization │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

---

## 2. สถาปัตยกรรมระบบ

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React SPA (Vite)                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │  │
│  │  │  Auth     │ │  File    │ │  Table   │ │  Dashboard  │ │  │
│  │  │  Module   │ │  Manager │ │  Engine  │ │  Builder    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │  │
│  │  │  UI      │ │  Access  │ │  Audit   │ │  Settings   │ │  │
│  │  │  Theme   │ │  Control │ │  Viewer  │ │  Panel      │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────┴────────────────────────────────────┐
│                        API Gateway Layer                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Node.js + Express.js Server                  │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │  Auth   │ │  RBAC   │ │  Rate    │ │  Validation  │  │  │
│  │  │  JWT    │ │  Guard  │ │  Limiter │ │  Middleware   │  │  │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────────┘  │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                    Service Layer                           │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐  │  │
│  │  │  User        │ │  Document     │ │  File/Folder      │  │  │
│  │  │  Service     │ │  Service      │ │  Service           │  │  │
│  │  └─────────────┘ └──────────────┘ └───────────────────┘  │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐  │  │
│  │  │  Table       │ │  Dashboard    │ │  Audit/Rollback   │  │  │
│  │  │  Service     │ │  Service      │ │  Service           │  │  │
│  │  └─────────────┘ └──────────────┘ └───────────────────┘  │  │
│  │  ┌─────────────┐ ┌──────────────┐                         │  │
│  │  │  Access      │ │  Notification │                        │  │
│  │  │  Service     │ │  Service      │                        │  │
│  │  └─────────────┘ └──────────────┘                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ mssql / tedious
┌────────────────────────────┴────────────────────────────────────┐
│                       Database Layer                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Microsoft SQL Server (SSMS)                   │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐ │  │
│  │  │  Core    │ │  Document  │ │  Access   │ │  Audit     │ │  │
│  │  │  Tables  │ │  Tables    │ │  Tables   │ │  Tables    │ │  │
│  │  └──────────┘ └───────────┘ └──────────┘ └────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack Detail

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18+ | SPA Framework |
| | TypeScript | 5+ | Type Safety |
| | Vite | 5+ | Build Tool |
| | Zustand | 4+ | State Management |
| | React Router | 6+ | Routing |
| | TanStack Table | 8+ | Table Engine |
| | React DnD / dnd-kit | latest | Drag & Drop |
| | Recharts / Chart.js | latest | Charts |
| | Framer Motion | 11+ | Animation |
| | Tailwind CSS | 3+ | Styling |
| | Socket.IO Client | 4+ | Real-time |
| **Backend** | Node.js | 20 LTS | Runtime |
| | Express.js | 4+ | HTTP Framework |
| | TypeScript | 5+ | Type Safety |
| | mssql (tedious) | 10+ | SQL Server Driver |
| | jsonwebtoken | 9+ | JWT Auth |
| | Socket.IO | 4+ | WebSocket |
| | multer | 1+ | File Upload |
| | winston | 3+ | Logging |
| | joi / zod | latest | Validation |
| **Database** | SQL Server | 2019+ | RDBMS |
| **Infra** | Nginx | latest | Reverse Proxy |
| | Redis | 7+ | Caching & Session |
| | Docker | latest | Containerization |

### 2.3 Project Structure

```
datasheet-pro/
├── client/                          # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── api/                     # API client functions
│   │   ├── assets/                  # Static assets
│   │   ├── components/
│   │   │   ├── common/              # Shared components
│   │   │   │   ├── Button/
│   │   │   │   ├── Modal/
│   │   │   │   ├── Dropdown/
│   │   │   │   ├── SearchInput/
│   │   │   │   ├── LoadingSpinner/
│   │   │   │   └── AnimatedTransition/
│   │   │   ├── layout/              # Layout components
│   │   │   │   ├── Sidebar/
│   │   │   │   ├── TopBar/
│   │   │   │   ├── MainContent/
│   │   │   │   └── BreadcrumbNav/
│   │   │   ├── auth/                # Auth components
│   │   │   ├── file-manager/        # Folder & File UI
│   │   │   ├── table/               # Spreadsheet engine
│   │   │   │   ├── TableContainer/
│   │   │   │   ├── ColumnHeader/
│   │   │   │   ├── CellRenderer/
│   │   │   │   ├── FilterBar/
│   │   │   │   ├── FreezeManager/
│   │   │   │   └── ZoomControl/
│   │   │   ├── document-builder/    # Form builder
│   │   │   ├── dashboard/           # Dashboard builder
│   │   │   │   ├── Canvas/
│   │   │   │   ├── WidgetToolbox/
│   │   │   │   ├── ChartWidget/
│   │   │   │   ├── ImageWidget/
│   │   │   │   └── TextWidget/
│   │   │   ├── access-control/      # Permission UI
│   │   │   ├── audit/               # Audit viewer
│   │   │   ├── user-management/     # User admin
│   │   │   └── settings/            # UI customization
│   │   ├── hooks/                   # Custom hooks
│   │   ├── store/                   # Zustand stores
│   │   ├── types/                   # TypeScript types
│   │   ├── utils/                   # Utilities
│   │   ├── theme/                   # Theme engine
│   │   ├── routes/                  # Route definitions
│   │   └── App.tsx
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── server/                          # Node.js Backend
│   ├── src/
│   │   ├── config/                  # DB, env config
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── rbac.middleware.ts
│   │   │   ├── rateLimiter.middleware.ts
│   │   │   └── validation.middleware.ts
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.routes.ts
│   │   │   │   └── auth.validation.ts
│   │   │   ├── users/
│   │   │   ├── folders/
│   │   │   ├── files/
│   │   │   ├── documents/
│   │   │   ├── sheets/
│   │   │   ├── columns/
│   │   │   ├── rows/
│   │   │   ├── cells/
│   │   │   ├── access/
│   │   │   ├── audit/
│   │   │   ├── favorites/
│   │   │   ├── dashboards/
│   │   │   ├── charts/
│   │   │   ├── themes/
│   │   │   └── notifications/
│   │   ├── shared/
│   │   │   ├── database/            # SQL connection pool
│   │   │   ├── errors/              # Error classes
│   │   │   ├── helpers/             # Utility functions
│   │   │   └── types/               # Shared types
│   │   ├── socket/                  # WebSocket handlers
│   │   └── app.ts
│   ├── migrations/                  # DB migrations
│   ├── seeds/                       # Seed data
│   └── package.json
│
├── database/
│   ├── schema/                      # SQL schema scripts
│   ├── stored-procedures/           # SP scripts
│   ├── views/                       # SQL Views
│   └── indexes/                     # Index scripts
│
├── docs/                            # Documentation
├── docker-compose.yml
└── README.md
```

---

## 3. โครงสร้างฐานข้อมูล

### 3.1 Entity Relationship Overview

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Users   │────▶│  UserRoles   │◀────│    Roles     │
└──────────┘     └──────────────┘     └──────────────┘
     │                                       │
     │           ┌──────────────┐            │
     ├──────────▶│  Favorites   │            │
     │           └──────────────┘            │
     │                                       │
     │           ┌──────────────┐     ┌──────────────┐
     ├──────────▶│ FileAccess   │────▶│    Files     │
     │           └──────────────┘     └──────────────┘
     │                                    │     │
     │           ┌──────────────┐         │     │
     ├──────────▶│AccessRequest │─────────┘     │
     │           └──────────────┘               │
     │                                          │
     │           ┌──────────────┐        ┌──────────────┐
     ├──────────▶│  AuditLog    │        │   Sheets     │
     │           └──────────────┘        └──────────────┘
     │                                          │
     │                                   ┌──────────────┐
     │                                   │   Columns    │
     │                                   └──────────────┘
     │                                          │
     │           ┌──────────────┐        ┌──────────────┐
     │           │  CellHistory │◀───────│    Rows      │
     │           └──────────────┘        └──────────────┘
     │                                          │
     │                                   ┌──────────────┐
     └──────────────────────────────────▶│    Cells     │
                                         └──────────────┘

┌──────────────┐     ┌──────────────┐
│   Folders    │────▶│  SubFolders  │  (self-referencing)
└──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│    Files     │
└──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboards  │────▶│   Widgets    │────▶│  ChartConfig │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 3.2 Table Definitions

#### 3.2.1 Core Tables

```sql
-- =====================================================
-- USERS
-- =====================================================
CREATE TABLE Users (
    user_id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    username        NVARCHAR(100)    NOT NULL UNIQUE,
    email           NVARCHAR(255)    NOT NULL UNIQUE,
    password_hash   NVARCHAR(500)    NOT NULL,
    display_name    NVARCHAR(200)    NOT NULL,
    avatar_url      NVARCHAR(1000)   NULL,
    is_active       BIT              NOT NULL DEFAULT 1,
    last_login_at   DATETIME2        NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    created_by      UNIQUEIDENTIFIER NULL REFERENCES Users(user_id),

    INDEX IX_Users_Email    (email),
    INDEX IX_Users_Username (username)
);

-- =====================================================
-- ROLES
-- =====================================================
CREATE TABLE Roles (
    role_id     INT IDENTITY(1,1) PRIMARY KEY,
    role_name   NVARCHAR(50) NOT NULL UNIQUE,  -- 'user', 'master', 'admin'
    description NVARCHAR(500) NULL,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

INSERT INTO Roles (role_name, description) VALUES
('user',   'สามารถกรอก/แก้ไขข้อมูลในไฟล์ที่ได้รับสิทธิ์'),
('master', 'สร้างฟอร์ม จัดการโฟลเดอร์ที่ตัวเองสร้างหรือมีสิทธิ์'),
('admin',  'ทำได้ทุกอย่าง: จัดการ User, สิทธิ์, ตั้งค่าระบบ');

-- =====================================================
-- USER_ROLES (Many-to-Many)
-- =====================================================
CREATE TABLE UserRoles (
    user_role_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    role_id      INT              NOT NULL REFERENCES Roles(role_id),
    assigned_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    assigned_by  UNIQUEIDENTIFIER NULL REFERENCES Users(user_id),

    UNIQUE (user_id, role_id)
);
```

#### 3.2.2 Folder & File Tables

```sql
-- =====================================================
-- FOLDERS (self-referencing for sub-folders)
-- =====================================================
CREATE TABLE Folders (
    folder_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    folder_name     NVARCHAR(300)    NOT NULL,
    parent_id       UNIQUEIDENTIFIER NULL REFERENCES Folders(folder_id),
    description     NVARCHAR(1000)   NULL,
    icon            NVARCHAR(100)    NULL DEFAULT 'folder',
    color           NVARCHAR(7)      NULL DEFAULT '#3B82F6',
    sort_order      INT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,

    INDEX IX_Folders_Parent  (parent_id),
    INDEX IX_Folders_Creator (created_by)
);

-- =====================================================
-- FILES (Document Files — each acts as a "workbook")
-- =====================================================
CREATE TABLE Files (
    file_id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    file_name       NVARCHAR(300)    NOT NULL,
    folder_id       UNIQUEIDENTIFIER NOT NULL REFERENCES Folders(folder_id),
    description     NVARCHAR(2000)   NULL,
    icon            NVARCHAR(100)    NULL DEFAULT 'file-spreadsheet',
    color           NVARCHAR(7)      NULL DEFAULT '#10B981',
    status          NVARCHAR(20)     NOT NULL DEFAULT 'active',
        -- active, archived, deleted
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,

    INDEX IX_Files_Folder  (folder_id),
    INDEX IX_Files_Creator (created_by),
    INDEX IX_Files_Status  (status)
);
```

#### 3.2.3 Sheet & Column Tables

```sql
-- =====================================================
-- SHEETS (Multiple sheets per file — like Excel tabs)
-- =====================================================
CREATE TABLE Sheets (
    sheet_id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Files(file_id),
    sheet_name      NVARCHAR(200)    NOT NULL,
    sort_order      INT              NOT NULL DEFAULT 0,
    is_active       BIT              NOT NULL DEFAULT 1,
    tab_color       NVARCHAR(7)      NULL,
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Sheets_File (file_id)
);

-- =====================================================
-- COLUMNS (Dynamic column definitions per sheet)
-- =====================================================
CREATE TABLE Columns (
    column_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    sheet_id        UNIQUEIDENTIFIER NOT NULL REFERENCES Sheets(sheet_id),
    column_name     NVARCHAR(200)    NOT NULL,
    data_type       NVARCHAR(30)     NOT NULL,
        -- 'varchar', 'int', 'float', 'date', 'datetime',
        -- 'boolean', 'select', 'multi_select', 'text', 'url', 'email'
    display_order   INT              NOT NULL DEFAULT 0,
    width           INT              NOT NULL DEFAULT 150,  -- px
    min_width       INT              NOT NULL DEFAULT 60,
    is_required     BIT              NOT NULL DEFAULT 0,
    is_frozen       BIT              NOT NULL DEFAULT 0,
    is_visible      BIT              NOT NULL DEFAULT 1,
    is_sortable     BIT              NOT NULL DEFAULT 1,
    is_filterable   BIT              NOT NULL DEFAULT 1,
    default_value   NVARCHAR(500)    NULL,
    placeholder     NVARCHAR(300)    NULL,
    validation_rule NVARCHAR(MAX)    NULL,  -- JSON: {min, max, regex, etc.}
    select_options  NVARCHAR(MAX)    NULL,  -- JSON array for select/multi_select
    description     NVARCHAR(500)    NULL,
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Columns_Sheet (sheet_id),
    INDEX IX_Columns_Order (sheet_id, display_order)
);
```

#### 3.2.4 Row & Cell Tables

```sql
-- =====================================================
-- ROWS
-- =====================================================
CREATE TABLE Rows (
    row_id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    sheet_id        UNIQUEIDENTIFIER NOT NULL REFERENCES Sheets(sheet_id),
    row_order       INT              NOT NULL DEFAULT 0,
    height          INT              NOT NULL DEFAULT 36,  -- px
    is_frozen       BIT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    is_deleted      BIT              NOT NULL DEFAULT 0,

    INDEX IX_Rows_Sheet (sheet_id),
    INDEX IX_Rows_Order (sheet_id, row_order)
);

-- =====================================================
-- CELLS (EAV pattern for dynamic columns)
-- =====================================================
CREATE TABLE Cells (
    cell_id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    row_id          UNIQUEIDENTIFIER NOT NULL REFERENCES Rows(row_id),
    column_id       UNIQUEIDENTIFIER NOT NULL REFERENCES Columns(column_id),
    value_text      NVARCHAR(MAX)    NULL,  -- varchar, text, url, email
    value_int       BIGINT           NULL,
    value_float     FLOAT            NULL,
    value_date      DATETIME2        NULL,
    value_bool      BIT              NULL,
    value_json      NVARCHAR(MAX)    NULL,  -- multi_select, complex types
    updated_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    UNIQUE (row_id, column_id),
    INDEX IX_Cells_Row    (row_id),
    INDEX IX_Cells_Column (column_id)
);
```

#### 3.2.5 Access Control Tables

```sql
-- =====================================================
-- FILE_ACCESS (สิทธิ์ระดับไฟล์ต่อผู้ใช้)
-- =====================================================
CREATE TABLE FileAccess (
    access_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Files(file_id),
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL DEFAULT 'read',
        -- 'read', 'write', 'manage'
    granted_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    granted_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at      DATETIME2        NULL,

    UNIQUE (file_id, user_id),
    INDEX IX_FileAccess_File (file_id),
    INDEX IX_FileAccess_User (user_id)
);

-- =====================================================
-- FOLDER_ACCESS (สิทธิ์ระดับโฟลเดอร์)
-- =====================================================
CREATE TABLE FolderAccess (
    access_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    folder_id       UNIQUEIDENTIFIER NOT NULL REFERENCES Folders(folder_id),
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL DEFAULT 'read',
    granted_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    granted_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    UNIQUE (folder_id, user_id)
);

-- =====================================================
-- ACCESS_REQUESTS (ระบบคำขอเข้าถึง)
-- =====================================================
CREATE TABLE AccessRequests (
    request_id      UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NULL REFERENCES Files(file_id),
    folder_id       UNIQUEIDENTIFIER NULL REFERENCES Folders(folder_id),
    requester_id    UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    permission      NVARCHAR(20)     NOT NULL DEFAULT 'read',
    note            NVARCHAR(2000)   NOT NULL,  -- หมายเหตุคำขอ (บังคับกรอก)
    status          NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        -- 'pending', 'approved', 'rejected'
    reviewed_by     UNIQUEIDENTIFIER NULL REFERENCES Users(user_id),
    review_note     NVARCHAR(2000)   NULL,
    reviewed_at     DATETIME2        NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_AccessReq_Status    (status),
    INDEX IX_AccessReq_Requester (requester_id),
    INDEX IX_AccessReq_File      (file_id)
);
```

#### 3.2.6 Audit & History Tables

```sql
-- =====================================================
-- AUDIT_LOG (ระบบบันทึกการกระทำทั้งหมด)
-- =====================================================
CREATE TABLE AuditLog (
    log_id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    action_type     NVARCHAR(50)     NOT NULL,
        -- 'cell_update', 'row_create', 'row_delete',
        -- 'column_create', 'column_update', 'column_delete',
        -- 'sheet_create', 'file_create', 'file_delete',
        -- 'access_grant', 'access_revoke', 'login', 'logout'
    entity_type     NVARCHAR(50)     NOT NULL,
        -- 'cell', 'row', 'column', 'sheet', 'file', 'folder', 'user'
    entity_id       NVARCHAR(100)    NOT NULL,
    file_id         UNIQUEIDENTIFIER NULL REFERENCES Files(file_id),
    sheet_id        UNIQUEIDENTIFIER NULL,
    old_value       NVARCHAR(MAX)    NULL,  -- JSON
    new_value       NVARCHAR(MAX)    NULL,  -- JSON
    ip_address      NVARCHAR(45)     NULL,
    user_agent      NVARCHAR(500)    NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Audit_User      (user_id),
    INDEX IX_Audit_File      (file_id),
    INDEX IX_Audit_Entity    (entity_type, entity_id),
    INDEX IX_Audit_CreatedAt (created_at DESC)
);

-- =====================================================
-- CELL_HISTORY (ประวัติการเปลี่ยนแปลงค่า Cell สำหรับ Rollback)
-- =====================================================
CREATE TABLE CellHistory (
    history_id      BIGINT IDENTITY(1,1) PRIMARY KEY,
    cell_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Cells(cell_id),
    row_id          UNIQUEIDENTIFIER NOT NULL,
    column_id       UNIQUEIDENTIFIER NOT NULL,
    old_value_text  NVARCHAR(MAX)    NULL,
    old_value_int   BIGINT           NULL,
    old_value_float FLOAT            NULL,
    old_value_date  DATETIME2        NULL,
    old_value_bool  BIT              NULL,
    old_value_json  NVARCHAR(MAX)    NULL,
    new_value_text  NVARCHAR(MAX)    NULL,
    new_value_int   BIGINT           NULL,
    new_value_float FLOAT            NULL,
    new_value_date  DATETIME2        NULL,
    new_value_bool  BIT              NULL,
    new_value_json  NVARCHAR(MAX)    NULL,
    changed_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    changed_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    version_number  INT              NOT NULL DEFAULT 1,

    INDEX IX_CellHistory_Cell      (cell_id),
    INDEX IX_CellHistory_Row       (row_id),
    INDEX IX_CellHistory_ChangedAt (changed_at DESC)
);

-- =====================================================
-- ROW_SNAPSHOTS (Snapshot ของแถวทั้งแถว สำหรับ Rollback แถว)
-- =====================================================
CREATE TABLE RowSnapshots (
    snapshot_id     BIGINT IDENTITY(1,1) PRIMARY KEY,
    row_id          UNIQUEIDENTIFIER NOT NULL REFERENCES Rows(row_id),
    sheet_id        UNIQUEIDENTIFIER NOT NULL,
    snapshot_data   NVARCHAR(MAX)    NOT NULL,  -- JSON ข้อมูลทั้งแถว
    snapshot_type   NVARCHAR(20)     NOT NULL,
        -- 'auto', 'manual', 'before_delete'
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_RowSnapshot_Row (row_id),
    INDEX IX_RowSnapshot_Sheet (sheet_id)
);
```

#### 3.2.7 Favorites Table

```sql
-- =====================================================
-- FAVORITES
-- =====================================================
CREATE TABLE Favorites (
    favorite_id     UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    entity_type     NVARCHAR(20)     NOT NULL,  -- 'file', 'folder'
    entity_id       UNIQUEIDENTIFIER NOT NULL,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    UNIQUE (user_id, entity_type, entity_id),
    INDEX IX_Favorites_User (user_id)
);
```

#### 3.2.8 Dashboard Tables

```sql
-- =====================================================
-- DASHBOARDS
-- =====================================================
CREATE TABLE Dashboards (
    dashboard_id    UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    file_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Files(file_id),
    dashboard_name  NVARCHAR(300)    NOT NULL,
    layout_config   NVARCHAR(MAX)    NULL,  -- JSON grid layout
    background      NVARCHAR(MAX)    NULL,  -- JSON: {color, image_url}
    sort_order      INT              NOT NULL DEFAULT 0,
    created_by      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Dashboard_File (file_id)
);

-- =====================================================
-- DASHBOARD_WIDGETS
-- =====================================================
CREATE TABLE DashboardWidgets (
    widget_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    dashboard_id    UNIQUEIDENTIFIER NOT NULL REFERENCES Dashboards(dashboard_id),
    widget_type     NVARCHAR(30)     NOT NULL,
        -- 'bar_chart', 'line_chart', 'pie_chart', 'doughnut_chart',
        -- 'area_chart', 'scatter_chart', 'table_summary',
        -- 'kpi_card', 'image', 'text_box', 'shape'
    title           NVARCHAR(300)    NULL,
    -- Position & Size (free-form placement like Power BI)
    pos_x           FLOAT            NOT NULL DEFAULT 0,
    pos_y           FLOAT            NOT NULL DEFAULT 0,
    width           FLOAT            NOT NULL DEFAULT 400,
    height          FLOAT            NOT NULL DEFAULT 300,
    z_index         INT              NOT NULL DEFAULT 1,
    -- Configuration
    config          NVARCHAR(MAX)    NOT NULL,  -- JSON chart/widget config
    style_config    NVARCHAR(MAX)    NULL,      -- JSON: {bgColor, border, shadow...}
    data_source     NVARCHAR(MAX)    NULL,      -- JSON: {sheet_id, columns, filters}
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Widget_Dashboard (dashboard_id)
);
```

#### 3.2.9 UI Theme Tables

```sql
-- =====================================================
-- USER_THEMES (การตั้งค่า UI ของแต่ละ User)
-- =====================================================
CREATE TABLE UserThemes (
    theme_id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id) UNIQUE,
    theme_name      NVARCHAR(100)    NOT NULL DEFAULT 'Default',
    primary_color   NVARCHAR(7)      NOT NULL DEFAULT '#3B82F6',
    secondary_color NVARCHAR(7)      NOT NULL DEFAULT '#6366F1',
    accent_color    NVARCHAR(7)      NOT NULL DEFAULT '#10B981',
    bg_color        NVARCHAR(7)      NOT NULL DEFAULT '#F8FAFC',
    sidebar_color   NVARCHAR(7)      NOT NULL DEFAULT '#1E293B',
    text_color      NVARCHAR(7)      NOT NULL DEFAULT '#1E293B',
    border_radius   INT              NOT NULL DEFAULT 8,      -- px
    component_gap   INT              NOT NULL DEFAULT 16,     -- px
    font_family     NVARCHAR(200)    NOT NULL DEFAULT 'Inter',
    font_size_base  INT              NOT NULL DEFAULT 14,     -- px
    sidebar_width   INT              NOT NULL DEFAULT 260,    -- px
    dark_mode       BIT              NOT NULL DEFAULT 0,
    custom_css      NVARCHAR(MAX)    NULL,
    updated_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE TABLE Notifications (
    notification_id  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(user_id),
    type             NVARCHAR(50)     NOT NULL,
        -- 'access_request', 'access_granted', 'access_rejected',
        -- 'file_shared', 'mention', 'system'
    title            NVARCHAR(300)    NOT NULL,
    message          NVARCHAR(2000)   NOT NULL,
    link             NVARCHAR(500)    NULL,
    is_read          BIT              NOT NULL DEFAULT 0,
    created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

    INDEX IX_Notif_User   (user_id),
    INDEX IX_Notif_Unread (user_id, is_read)
);
```

---

## 4. ระบบจัดการผู้ใช้และบทบาท

### 4.1 User Management Features

```
┌────────────────────────────────────────────────┐
│              User Management Flow               │
├────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐ │
│  │  Create   │───▶│  Assign   │───▶│  Active  │ │
│  │  Account  │    │  Role     │    │  User    │ │
│  └──────────┘    └───────────┘    └──────────┘ │
│                                      │    │      │
│                              ┌───────┘    │      │
│                              ▼            ▼      │
│                        ┌──────────┐ ┌──────────┐│
│                        │  Edit    │ │  Deact.  ││
│                        │  Profile │ │  User    ││
│                        └──────────┘ └──────────┘│
└────────────────────────────────────────────────┘
```

#### 4.1.1 ฟังก์ชันสำหรับ Admin

| ฟังก์ชัน | คำอธิบาย |
|----------|----------|
| สร้าง User | กรอก username, email, password, display name, กำหนด role |
| แก้ไข User | เปลี่ยน display name, email, role, สถานะ active/inactive |
| ปิดการใช้งาน | Deactivate user (ไม่ลบข้อมูล แค่ปิดการเข้าใช้) |
| Reset Password | ส่ง link reset password ไปที่ email หรือกำหนด password ใหม่ |
| ดูรายชื่อ User | ตาราง User ทั้งหมด พร้อม filter ตาม role, status |
| Bulk Operations | เลือกหลาย User เพื่อเปลี่ยน role หรือ deactivate พร้อมกัน |

#### 4.1.2 Permission Matrix

| Action | User | Master | Admin |
|--------|------|--------|-------|
| กรอก/แก้ไขข้อมูลในไฟล์ที่มีสิทธิ์ | ✅ | ✅ | ✅ |
| ดู Dashboard | ✅ | ✅ | ✅ |
| ติดดาว Favorites | ✅ | ✅ | ✅ |
| Search ไฟล์/โฟลเดอร์ | ✅ | ✅ | ✅ |
| ส่งคำขอเข้าถึง | ✅ | ✅ | ✅ |
| สร้าง/แก้ไข ฟอร์มเอกสาร | ❌ | ✅ (ของตัวเอง/มีสิทธิ์) | ✅ |
| สร้าง/แก้ไข Column | ❌ | ✅ (ของตัวเอง/มีสิทธิ์) | ✅ |
| สร้าง/จัดการ Folder | ❌ | ✅ (ของตัวเอง/มีสิทธิ์) | ✅ |
| ลบ File/Folder | ❌ | ✅ (ของตัวเอง) | ✅ |
| กำหนดสิทธิ์ไฟล์ | ❌ | ✅ (ของตัวเอง/มีสิทธิ์) | ✅ |
| อนุมัติ/ปฏิเสธคำขอเข้าถึง | ❌ | ✅ (ของตัวเอง) | ✅ |
| สร้าง Dashboard | ❌ | ✅ | ✅ |
| จัดการ User | ❌ | ❌ | ✅ |
| ดู Audit Log ทั้งหมด | ❌ | ✅ (เฉพาะของตัวเอง) | ✅ |
| Rollback Data | ❌ | ✅ (ของตัวเอง/มีสิทธิ์) | ✅ |
| ตั้งค่า UI Theme (ตัวเอง) | ✅ | ✅ | ✅ |
| ตั้งค่าระบบ Global | ❌ | ❌ | ✅ |

### 4.2 Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Login   │────▶│ Validate │────▶│  Issue   │────▶│  Store   │
│  Form    │     │ Creds    │     │  JWT     │     │ Token    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                                  │
                      │ fail                             │
                      ▼                                  ▼
                 ┌──────────┐                      ┌──────────┐
                 │  Error   │                      │  Redirect│
                 │  Message │                      │  to App  │
                 └──────────┘                      └──────────┘

Token Structure:
{
  "user_id": "uuid",
  "username": "string",
  "roles": ["user"|"master"|"admin"],
  "display_name": "string",
  "iat": timestamp,
  "exp": timestamp  // 8 hours
}

Refresh Token: stored in HttpOnly cookie, 7 days expiry
```

---

## 5. ระบบจัดการโฟลเดอร์และไฟล์

### 5.1 Folder Structure (SharePoint-like)

```
Root
├── 📁 Production Reports          ◀── Folder
│   ├── 📁 2026-Q1                 ◀── Sub-folder
│   │   ├── 📊 IR LINE PF1-01     ◀── File (workbook)
│   │   ├── 📊 IR LINE PF1-02
│   │   └── 📊 QC Load Report
│   ├── 📁 2026-Q2
│   │   └── 📊 ...
│   └── 📁 Templates
│       └── 📊 IR Template Master
├── 📁 Quality Control
│   ├── 📁 QC Line
│   └── 📁 QC Load
└── 📁 Dashboard Files
    └── 📊 Monthly Overview
```

### 5.2 File Manager UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────┐  ┌──────────────────────────────┐  ┌───────────┐ │
│  │ ⭐ Fav  │  │  🔍 Search files & folders... │  │ + New ▼   │ │
│  └─────────┘  └──────────────────────────────┘  └───────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  📁 Root  ▶  📁 Production Reports  ▶  📁 2026-Q1            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │  📁        │  │  📁        │  │  📊        │                │
│  │  Templates │  │  Archives  │  │  IR LINE   │                │
│  │            │  │            │  │  PF1-01    │                │
│  │  ⭐ 3 files│  │  12 files  │  │  ⭐ Master │                │
│  └────────────┘  └────────────┘  └────────────┘                │
│                                                                  │
│  ┌────────────┐  ┌────────────┐                                │
│  │  📊        │  │  📊        │                                │
│  │  QC Load   │  │  NRFT     │                                │
│  │  Report    │  │  2026-09  │                                │
│  │  User A    │  │  Master B  │                                │
│  └────────────┘  └────────────┘                                │
│                                                                  │
│  Activity:                                                       │
│  🟢 Peerapat edited IR Load-09 — 14 min ago                   │
│  🟢 Panpailin created NRFT2026-09 — 20 min ago                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Folder/File Features

| Feature | คำอธิบาย |
|---------|----------|
| **สร้าง Folder** | ตั้งชื่อ, เลือก parent folder, กำหนดสี/icon, เพิ่ม description |
| **สร้าง Sub-folder** | สร้างภายใต้ folder ใดก็ได้ (ไม่จำกัดระดับความลึก แต่แนะนำ max 5 ระดับ) |
| **สร้าง File** | ตั้งชื่อ, เลือก folder, เพิ่ม description, กำหนด default sheet |
| **ย้าย File/Folder** | Drag & Drop หรือใช้ Move dialog |
| **คัดลอก File** | Duplicate ไฟล์พร้อม structure (columns) โดยไม่คัดลอกข้อมูล หรือคัดลอกพร้อมข้อมูล |
| **ลบ** | Soft delete (ย้ายไป Trash), สามารถ restore ได้ภายใน 30 วัน |
| **เปลี่ยนชื่อ** | Inline rename ด้วย double-click |
| **Search** | ค้นหาด้วยชื่อ file/folder, full-text search ที่รองรับ fuzzy match |
| **Sort** | เรียงตามชื่อ, วันที่สร้าง, วันที่แก้ไขล่าสุด, ผู้สร้าง |
| **View Mode** | สลับระหว่าง Grid view / List view / Tree view |
| **Breadcrumb** | แสดง path ปัจจุบัน คลิกกลับไป folder ไหนก็ได้ |

### 5.4 File Open Animation Flow

```
User clicks file
    │
    ▼
┌──────────────────────┐
│  Scale-up animation  │   ── file card ขยายจาก thumbnail
│  (200ms ease-out)    │      ไปเต็ม viewport
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Loading skeleton    │   ── แสดง skeleton ของ table
│  with shimmer        │      พร้อม progress bar
│  (fetch data)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Fade-in table data  │   ── ข้อมูลค่อยๆ fade in
│  (300ms stagger)     │      ทีละแถว (stagger 20ms)
└──────────────────────┘
```

---

## 6. ระบบสร้างเอกสาร/ฟอร์ม

### 6.1 Document Builder Flow

```
Master/Admin เปิดหน้าสร้างไฟล์ใหม่
    │
    ▼
┌──────────────────────────────────────────────┐
│  Step 1: ตั้งค่าพื้นฐาน                       │
│  ├── ชื่อไฟล์                                  │
│  ├── เลือก Folder                              │
│  ├── Description                               │
│  └── กำหนด Icon / สี                           │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Step 2: สร้าง Sheet                          │
│  ├── ตั้งชื่อ Sheet                             │
│  ├── เพิ่ม Sheet ได้หลายแท็บ (tabs)             │
│  └── สี Tab                                    │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Step 3: กำหนดคอลัมน์ของแต่ละ Sheet            │
│  ├── ชื่อคอลัมน์                                │
│  ├── ประเภทข้อมูล (Data Type)                   │
│  ├── Required? (บังคับกรอก/ไม่บังคับ)            │
│  ├── Default Value                             │
│  ├── Validation Rules                          │
│  ├── Width (ความกว้าง px)                       │
│  ├── Placeholder text                          │
│  └── Description / Tooltip                     │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Step 4: กำหนดสิทธิ์เข้าถึง                     │
│  ├── เลือก User ที่มีสิทธิ์                      │
│  ├── กำหนดระดับสิทธิ์ (read/write/manage)       │
│  └── สิทธิ์ระดับ folder (สืบทอด)                 │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Step 5: Preview & Create                     │
│  ├── ตรวจสอบ structure ทั้งหมด                  │
│  └── กดสร้าง                                   │
└──────────────────────────────────────────────┘
```

### 6.2 Supported Data Types

| Data Type | SQL Storage | Input Component | Validation |
|-----------|-------------|-----------------|------------|
| `varchar` | `value_text` NVARCHAR(MAX) | Text Input | Max length, regex pattern |
| `text` | `value_text` NVARCHAR(MAX) | Textarea (multiline) | Max length |
| `int` | `value_int` BIGINT | Number Input | Min, max, step |
| `float` | `value_float` FLOAT | Number Input (decimal) | Min, max, decimal places |
| `date` | `value_date` DATETIME2 | Date Picker | Min date, max date |
| `datetime` | `value_date` DATETIME2 | DateTime Picker | Min, max |
| `boolean` | `value_bool` BIT | Toggle / Checkbox | — |
| `select` | `value_text` | Dropdown (single) | Options list |
| `multi_select` | `value_json` | Dropdown (multi) | Options list, max selections |
| `url` | `value_text` | URL Input | URL format validation |
| `email` | `value_text` | Email Input | Email format validation |

### 6.3 Column Configuration Schema (JSON)

```json
{
  "column_name": "ราคาสินค้า",
  "data_type": "float",
  "is_required": true,
  "display_order": 3,
  "width": 120,
  "default_value": null,
  "placeholder": "กรอกราคา (บาท)",
  "validation": {
    "min": 0,
    "max": 999999.99,
    "decimal_places": 2
  },
  "select_options": null,
  "description": "ราคาสินค้าต่อชิ้น (บาท)"
}
```

```json
{
  "column_name": "สถานะ",
  "data_type": "select",
  "is_required": true,
  "display_order": 5,
  "width": 140,
  "default_value": "pending",
  "select_options": [
    {"value": "pending",    "label": "รอดำเนินการ", "color": "#F59E0B"},
    {"value": "in_progress","label": "กำลังดำเนินการ","color": "#3B82F6"},
    {"value": "completed",  "label": "เสร็จสิ้น",     "color": "#10B981"},
    {"value": "cancelled",  "label": "ยกเลิก",        "color": "#EF4444"}
  ]
}
```

---

## 7. ระบบ Table & Spreadsheet

### 7.1 Table UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📊 IR LINE PF1-09                        🔍  ⭐  📋  ↕️ Zoom: 100%  │
│  Sheet1 │ Sheet2 │ Sheet3 │ +                    Full Screen  ⛶      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌── Filter Bar ──────────────────────────────────────────────────┐    │
│  │  Col A ▼    Col B ▼    Col C ▼    Col D ▼    Status ▼   ...  │    │
│  │  [search]   [search]   [search]   [search]   [search]        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌── Table ───────────────────────────────────────────────────────┐    │
│  │ ☐ │ # │  Col A  ↕ │  Col B  ↕ │  Col C  ↕ │  Status  ↕ │    │    │
│  │───┼───┼───────────┼───────────┼───────────┼────────────┼────│    │
│  │ ☐ │ 1 │  value    │  value    │  12,500   │ 🟡 Pending │    │    │
│  │ ☐ │ 2 │  value    │  value    │  8,200    │ 🟢 Done    │    │    │
│  │ ☐ │ 3 │  value    │  value    │  15,000   │ 🔵 WIP     │    │    │
│  │   │   │           │           │           │            │    │    │
│  │   │   │  ← drag to resize →  │           │            │    │    │
│  │                                                             │    │
│  │  ───── Frozen columns/rows remain fixed while scrolling ──  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌── Footer ──────────────────────────────────────────────────────┐    │
│  │  Showing 1-50 of 1,234 rows    │ ← 1 2 3 ... 25 →  │ +Add Row│    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Table Features Detail

#### 7.2.1 Sort System

```
Filter/Sort Bar (อยู่เหนือ Table)
┌──────────────────────────────────────────────────────────┐
│  แต่ละคอลัมน์มี Dropdown Filter:                          │
│                                                            │
│  ┌─────────────────┐                                      │
│  │  ชื่อสินค้า    ▼  │  ◀── คลิกเปิด dropdown              │
│  ├─────────────────┤                                      │
│  │ 🔍 ค้นหา...     │  ◀── ช่อง search ภายใน dropdown       │
│  ├─────────────────┤                                      │
│  │ Sort A→Z    ↑   │                                      │
│  │ Sort Z→A    ↓   │                                      │
│  ├─────────────────┤                                      │
│  │ ☑ Apple         │                                      │
│  │ ☑ Banana        │                                      │
│  │ ☐ Cherry        │  ◀── multi-select filter values       │
│  │ ☑ Date          │                                      │
│  │ ...             │                                      │
│  ├─────────────────┤                                      │
│  │ [Clear] [Apply] │                                      │
│  └─────────────────┘                                      │
│                                                            │
│  รองรับ multi-column sort:                                 │
│  Primary: Col A (ASC) → Secondary: Col B (DESC)           │
└──────────────────────────────────────────────────────────┘
```

#### 7.2.2 Zoom & Fullscreen

| Feature | คำอธิบาย | Implementation |
|---------|----------|----------------|
| **Zoom In/Out** | ปรับ scale 50%–200% | CSS `transform: scale()` บน table container |
| **Zoom Control** | Slider + ปุ่ม +/- + preset (75%, 100%, 125%, 150%) | Toolbar component |
| **Full Screen** | กด F11 หรือปุ่ม ⛶ เพื่อขยาย table เต็มจอ | Fullscreen API |
| **Keyboard Shortcut** | Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset | Event listener |

#### 7.2.3 Column/Row Resize

```
Resize columns:
  ลาก border ขวาของ column header เพื่อปรับความกว้าง
  ├── Double-click border: auto-fit width ตามเนื้อหาที่ยาวที่สุด
  ├── Min width: ตามค่า min_width ใน column config (default 60px)
  └── Max width: ไม่จำกัด

Resize rows:
  ลาก border ล่างของ row number เพื่อปรับความสูง
  ├── Default height: 36px
  ├── Min height: 24px
  └── Max height: 500px
```

#### 7.2.4 Freeze Columns/Rows

```
Freeze Mechanism:
┌───────────┬─────────────────────────────────────────┐
│  FROZEN   │           SCROLLABLE AREA                │
│  COLUMNS  │                                          │
│  ┌─────┐  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │  A  │  │  │  D  │ │  E  │ │  F  │ │  G  │      │
│  │  B  │  │  │     │ │     │ │     │ │     │ ───▶ │
│  │  C  │  │  │     │ │     │ │     │ │     │      │
│  └─────┘  │  └─────┘ └─────┘ └─────┘ └─────┘      │
│           │                                          │
│   fixed   │   ◀── horizontal scroll ──▶              │
└───────────┴─────────────────────────────────────────┘

วิธีใช้:
├── Right-click column header → "Freeze up to this column"
├── Right-click row → "Freeze up to this row"
├── Drag freeze handle (เส้นแบ่ง) เพื่อปรับตำแหน่ง
└── Unfreeze: Right-click → "Unfreeze all" หรือลาก handle กลับ

Implementation:
├── ใช้ CSS position: sticky
├── Frozen columns: left: <calculated>px + z-index สูงกว่า
├── Frozen rows: top: <calculated>px + z-index สูงกว่า
└── เก็บ freeze state ลง column/row config ใน DB
```

### 7.3 Cell Editing

```
Cell Types & Input Behavior:

varchar / text:
  ├── Click → inline text input
  ├── Double-click → expand to full editor
  └── Enter = save, Escape = cancel

int / float:
  ├── Click → inline number input
  ├── Validation แสดงขอบแดงถ้าค่าไม่ผ่าน
  └── Auto-format ตัวเลขด้วย comma separator

date / datetime:
  ├── Click → date/datetime picker popup
  ├── รองรับ keyboard input (dd/mm/yyyy)
  └── Calendar widget พร้อม today shortcut

boolean:
  └── Click → toggle true/false (checkbox)

select:
  ├── Click → dropdown list พร้อม search
  ├── Option มีสีกำกับ (color badge)
  └── Single select

multi_select:
  ├── Click → dropdown list (multi-check)
  ├── แสดงเป็น tag/chip ในเซลล์
  └── มี search ภายใน dropdown

Required field:
  ├── แสดง * (asterisk) ที่ column header
  ├── Cell ที่ required แต่ว่างจะมี border สีแดงจาง
  └── ไม่สามารถบันทึกแถวถ้า required field ว่าง
      (แสดง toast error ระบุว่าคอลัมน์ไหนบังคับ)
```

### 7.4 Table Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | ย้ายไปเซลล์ถัดไป (ขวา) |
| `Shift+Tab` | ย้ายไปเซลล์ก่อนหน้า (ซ้าย) |
| `Enter` | บันทึกและย้ายลงแถวถัดไป |
| `Escape` | ยกเลิกการแก้ไข |
| `Arrow Keys` | เลื่อนระหว่างเซลล์ |
| `Ctrl+C` | คัดลอกค่าเซลล์ |
| `Ctrl+V` | วางค่า |
| `Ctrl+Z` | Undo การแก้ไขล่าสุด |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+=` | Zoom In |
| `Ctrl+-` | Zoom Out |
| `Ctrl+0` | Reset Zoom (100%) |
| `F11` | Full Screen toggle |
| `Ctrl+F` | เปิด search ในตาราง |

---

## 8. ระบบสิทธิ์การเข้าถึง

### 8.1 Access Control Architecture

```
สิทธิ์ถูกควบคุม 3 ระดับ:

Level 1: Role-Based (RBAC)
  ├── user   → data entry เท่านั้น
  ├── master → สร้าง/จัดการ ฟอร์ม + folder ที่มีสิทธิ์
  └── admin  → ทุกอย่าง

Level 2: Folder Access
  ├── สิทธิ์ระดับ folder สืบทอดลงไปยัง sub-folder และ file
  ├── read   → ดูรายชื่อไฟล์ในโฟลเดอร์
  ├── write  → สร้าง/แก้ไขไฟล์ในโฟลเดอร์
  └── manage → จัดการสิทธิ์ + ลบ + ย้าย

Level 3: File Access (override folder access)
  ├── read   → ดูข้อมูลเท่านั้น
  ├── write  → กรอก/แก้ไขข้อมูล
  └── manage → แก้ไข structure + จัดการสิทธิ์ + ลบ
```

### 8.2 Access Request Flow

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────┐
│  User    │────▶│  คำขอเข้าถึง   │────▶│  Owner /     │────▶│  อนุมัติ  │
│  ส่งคำขอ  │     │  + หมายเหตุ    │     │  Admin       │     │  ✅/❌    │
│          │     │  (บังคับกรอก)   │     │  ตรวจสอบ      │     │          │
└──────────┘     └───────────────┘     └──────────────┘     └──────────┘
                                              │                    │
                                    ┌─────────┘                    │
                                    ▼                              ▼
                              ┌──────────┐               ┌────────────────┐
                              │ 🔔 แจ้ง   │               │ อนุมัติ: เพิ่มสิทธิ์│
                              │ เตือน     │               │ ปฏิเสธ: แจ้ง User │
                              │ Real-time │               │ + เหตุผล          │
                              └──────────┘               └────────────────┘
```

**Access Request Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Target | Display | — | ชื่อไฟล์/โฟลเดอร์ที่ต้องการเข้าถึง |
| Permission | Dropdown | ✅ | read / write / manage |
| Note | Textarea | ✅ | เหตุผลที่ต้องการเข้าถึง (min 10 ตัวอักษร) |
| Duration | Dropdown | ❌ | ถาวร / 7 วัน / 30 วัน / 90 วัน / กำหนดเอง |

---

## 9. ระบบ Audit Log & Data Rollback

### 9.1 Audit Log System

#### 9.1.1 Events ที่ถูกบันทึก

| Category | Events |
|----------|--------|
| **Data** | cell_update, row_create, row_delete, bulk_update, bulk_delete |
| **Structure** | column_create, column_update, column_delete, sheet_create, sheet_rename, sheet_delete |
| **File/Folder** | file_create, file_rename, file_move, file_delete, folder_create, folder_rename, folder_delete |
| **Access** | access_grant, access_revoke, access_request, access_approve, access_reject |
| **Auth** | login, logout, password_change, role_change |
| **Dashboard** | dashboard_create, widget_add, widget_update, widget_delete |

#### 9.1.2 Audit Log Viewer UI

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Audit Log                                               │
├─────────────────────────────────────────────────────────────┤
│  Filters:                                                    │
│  [User ▼]  [Action ▼]  [File ▼]  [Date From] [Date To]    │
│                                                              │
│  ┌────────┬──────────┬──────────┬────────────┬───────────┐ │
│  │ Time   │ User     │ Action   │ Detail     │ Rollback  │ │
│  ├────────┼──────────┼──────────┼────────────┼───────────┤ │
│  │ 14:32  │ Peerapat │ แก้ไขเซลล์│ Col: ราคา  │  ↩ Undo  │ │
│  │        │          │          │ 500→800    │           │ │
│  ├────────┼──────────┼──────────┼────────────┼───────────┤ │
│  │ 14:28  │ Admin    │ เพิ่มสิทธิ์│ User B    │     —     │ │
│  │        │          │          │ → write    │           │ │
│  ├────────┼──────────┼──────────┼────────────┼───────────┤ │
│  │ 14:15  │ Panpailin│ เพิ่มแถว  │ Row #45   │  ↩ Undo  │ │
│  │        │          │          │ Sheet1     │           │ │
│  └────────┴──────────┴──────────┴────────────┴───────────┘ │
│                                                              │
│  ← 1 2 3 ... 50 →                                          │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Data Rollback System

```
Rollback ทำงานได้ 3 ระดับ:

1. Cell-Level Rollback
   ├── ย้อนกลับค่าเซลล์เดียวไปยัง version ก่อนหน้า
   ├── ดู history ของเซลล์ (ทุก version ที่เคยเปลี่ยน)
   ├── เลือก version ที่ต้องการ restore
   └── บันทึก audit log ว่า rollback โดยใคร

2. Row-Level Rollback
   ├── ย้อนกลับข้อมูลทั้งแถวจาก RowSnapshot
   ├── Snapshot ถูกสร้างอัตโนมัติทุกครั้งที่แก้ไข (configurable)
   ├── Restore row ที่ถูกลบ (soft delete)
   └── เปรียบเทียบ diff ระหว่าง version

3. Sheet-Level Rollback (Admin only)
   ├── ย้อนกลับ sheet ทั้ง sheet ไปยังจุดเวลาที่กำหนด (point-in-time)
   ├── ใช้ CellHistory + RowSnapshots ร่วมกัน
   ├── แสดง preview ก่อน rollback จริง
   └── Confirmation dialog + เหตุผล
```

#### 9.2.1 Cell History Viewer

```
┌─────────────────────────────────────────┐
│  📜 Cell History                        │
│  Column: ราคาสินค้า  |  Row: #12       │
├─────────────────────────────────────────┤
│                                          │
│  Version 5 (Current)                     │
│  Value: 850.00                           │
│  By: Peerapat — 14:32 Today             │
│                                ┌───────┐│
│  Version 4                     │Restore││
│  Value: 500.00                 └───────┘│
│  By: Panpailin — 10:15 Today            │
│                                ┌───────┐│
│  Version 3                     │Restore││
│  Value: 750.00                 └───────┘│
│  By: Peerapat — Yesterday 16:40         │
│                                          │
│  Version 2 ...                           │
│  Version 1 (Original) ...                │
│                                          │
└─────────────────────────────────────────┘
```

---

## 10. ระบบ Dashboard & Chart Builder

### 10.1 Dashboard Canvas (Power BI-like)

```
┌──────────────────────────────────────────────────────────────────────┐
│  📊 Monthly Dashboard          [Edit Mode] [Preview] [Share]        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Toolbox (Edit Mode):                                                │
│  ┌────┬────┬────┬────┬────┬────┬────┬────┐                         │
│  │ 📊 │ 📈 │ 🥧 │ 📏 │ 🔢 │ 📝 │ 🖼  │ ⬜ │                         │
│  │Bar │Line│Pie │Area│KPI │Text│Img │Box │                         │
│  └────┴────┴────┴────┴────┴────┴────┴────┘                         │
│                                                                       │
│  Canvas: (free-form drag & resize)                                   │
│  ┌─────────────────────────┬───────────────────────┐                 │
│  │  📊 Revenue by Month    │   🔢 Total Revenue    │                 │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐  │   ┌──────────────┐    │                 │
│  │  │  │ │  │ │  │ │  │  │   │  1,250,000   │    │                 │
│  │  │  │ │  │ │  │ │  │  │   │    +12.5%     │    │                 │
│  │  └──┘ └──┘ └──┘ └──┘  │   └──────────────┘    │                 │
│  │  Jan  Feb  Mar  Apr    │                        │                 │
│  ├─────────────────────────┼───────────────────────┤                 │
│  │  📈 Trend Line          │   🥧 Status Dist.     │                 │
│  │  ╱─────╲                │   ┌──────┐            │                 │
│  │ ╱       ╲──────╱        │   │ ██ 45%│ Done      │                 │
│  │╱                        │   │ ██ 30%│ WIP       │                 │
│  │                         │   │ ██ 25%│ Pending   │                 │
│  └─────────────────────────┴───────────────────────┘                 │
│                                                                       │
│  ┌───────────────────────────────────────────────┐                   │
│  │  🖼  Company Logo                              │  ◀── วางรูปได้   │
│  └───────────────────────────────────────────────┘                   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.2 Widget Types

| Widget | Description | Data Source |
|--------|-------------|------------|
| **Bar Chart** | แท่งกราฟแนวตั้ง/แนวนอน | เลือก Column จาก Sheet |
| **Line Chart** | เส้นกราฟ (time series) | เลือก Column x, y จาก Sheet |
| **Pie / Doughnut** | กราฟวงกลม | Group by Column, Count/Sum |
| **Area Chart** | พื้นที่ใต้กราฟ | เลือก Column จาก Sheet |
| **Scatter Plot** | กราฟจุดกระจาย | เลือก 2 Columns (x, y) |
| **KPI Card** | ตัวเลขสำคัญ + % change | SUM/AVG/COUNT/MIN/MAX จาก Column |
| **Table Summary** | ตารางสรุป (pivot-like) | เลือก Columns + Aggregation |
| **Text Box** | กล่องข้อความอิสระ | User input (rich text) |
| **Image** | รูปภาพ | Upload หรือ URL |
| **Shape/Box** | กล่องสี/กรอบ สำหรับ overlay | Style config |

### 10.3 Chart Configuration UI

```
┌────────────────────────────────────────┐
│  Chart Configuration                    │
├────────────────────────────────────────┤
│                                          │
│  Chart Type: [Bar Chart       ▼]        │
│                                          │
│  Data Source:                            │
│  ├── File:   [IR LINE PF1-09  ▼]       │
│  ├── Sheet:  [Sheet1          ▼]       │
│  ├── X Axis: [เดือน            ▼]       │
│  ├── Y Axis: [ยอดขาย          ▼]       │
│  └── Group:  [สถานะ           ▼]       │
│                                          │
│  Aggregation: [SUM ▼]                   │
│  Filter:      [สถานะ = Done   ▼]       │
│                                          │
│  Style:                                  │
│  ├── Title:       [____________]        │
│  ├── Colors:      [🎨 Auto / Custom]    │
│  ├── Legend:      [✅ Show]             │
│  ├── Grid Lines:  [✅ Show]             │
│  ├── Background:  [#FFFFFF]             │
│  ├── Border:      [1px solid #E5E7EB]  │
│  └── Border Radius: [8] px             │
│                                          │
│  [Cancel]  [Preview]  [Save]            │
└────────────────────────────────────────┘
```

### 10.4 Dashboard Layout System

```
Free-form Canvas:
├── ทุก widget มี: position (x, y), size (width, height), z-index
├── Drag to move → snap to grid (optional, 10px grid)
├── Resize handles (8 จุด: corners + edges)
├── z-index control: Bring to front / Send to back
├── Alignment guides (snap lines เมื่อลากใกล้ widget อื่น)
├── Multi-select → align / distribute
├── Copy / Paste widget
├── Lock widget position
└── Box/Image สามารถวางทับ widget อื่นได้ (z-index สูงกว่า)
```

---

## 11. ระบบ UI Customization

### 11.1 Theme Engine Architecture

```
┌──────────────────────────────────────────────┐
│  Theme Settings Panel                         │
├──────────────────────────────────────────────┤
│                                                │
│  🎨 Colors                                    │
│  ├── Primary:    [■ #3B82F6]  ◀── color picker│
│  ├── Secondary:  [■ #6366F1]                  │
│  ├── Accent:     [■ #10B981]                  │
│  ├── Background: [■ #F8FAFC]                  │
│  ├── Sidebar:    [■ #1E293B]                  │
│  └── Text:       [■ #1E293B]                  │
│                                                │
│  🔤 Typography                                │
│  ├── Font Family: [Inter           ▼]         │
│  │   ◀── dropdown จาก Google Fonts             │
│  │   พร้อม preview ของแต่ละ font               │
│  ├── Base Size:   [14] px                      │
│  └── Preview:     Aa Bb Cc 123                 │
│                                                │
│  📐 Layout                                    │
│  ├── Border Radius: [8] px  ───○──── slider   │
│  ├── Component Gap: [16] px ───○──── slider   │
│  ├── Sidebar Width: [260] px ──○──── slider   │
│  └── Dark Mode: [ ] toggle                     │
│                                                │
│  [Reset Default]  [Preview]  [Save]           │
└──────────────────────────────────────────────┘
```

### 11.2 CSS Variable System

```css
:root {
  /* จากค่าที่ User ตั้งใน UserThemes table */
  --ds-primary:      var(--user-primary, #3B82F6);
  --ds-secondary:    var(--user-secondary, #6366F1);
  --ds-accent:       var(--user-accent, #10B981);
  --ds-bg:           var(--user-bg, #F8FAFC);
  --ds-sidebar:      var(--user-sidebar, #1E293B);
  --ds-text:         var(--user-text, #1E293B);
  --ds-radius:       var(--user-radius, 8px);
  --ds-gap:          var(--user-gap, 16px);
  --ds-sidebar-w:    var(--user-sidebar-w, 260px);
  --ds-font:         var(--user-font, 'Inter', sans-serif);
  --ds-font-size:    var(--user-font-size, 14px);

  /* Derived colors (auto-calculated) */
  --ds-primary-hover:  color-mix(in srgb, var(--ds-primary) 85%, black);
  --ds-primary-light:  color-mix(in srgb, var(--ds-primary) 15%, white);
  --ds-border:         #E2E8F0;
  --ds-shadow:         0 1px 3px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --ds-bg:      #0F172A;
  --ds-text:    #F1F5F9;
  --ds-border:  #334155;
  --ds-shadow:  0 1px 3px rgba(0,0,0,0.4);
}
```

### 11.3 Google Fonts Integration

```
Flow:
1. User เปิด Font Selector dropdown
2. Frontend ดึงรายชื่อ font จาก Google Fonts API
3. แสดง font list พร้อม live preview (lazy-load font preview)
4. User เลือก font → โหลด font จาก Google CDN
5. Apply CSS variable --ds-font
6. บันทึกชื่อ font ลง UserThemes.font_family

Popular Fonts (pre-loaded):
├── Inter
├── Prompt (Thai)
├── Sarabun (Thai)
├── Noto Sans Thai
├── IBM Plex Sans Thai
├── Kanit
├── Roboto
├── Open Sans
├── Poppins
└── Nunito
```

---

## 12. ระบบ Favorites & Search

### 12.1 Favorites System

```
Feature:
├── ติดดาว ⭐ ได้ทั้ง Folder และ File
├── Favorites section อยู่ด้านบนสุดของ Sidebar
├── เรียงตามลำดับที่ติดดาวล่าสุด
├── คลิกดาวอีกครั้งเพื่อถอดออก
├── Animation: ดาวหมุน + scale bounce เมื่อกด
└── แต่ละ User เห็นเฉพาะ favorites ของตัวเอง

Sidebar Layout:
┌──────────────────┐
│  ⭐ Favorites     │
│  ├── 📊 IR Load-09│
│  ├── 📁 QC Line   │
│  └── 📊 NRFT 2026│
│                    │
│  📁 All Folders    │
│  ├── 📁 Production│
│  ├── 📁 QC        │
│  └── 📁 Dashboard │
│                    │
│  🕐 Recent         │
│  ├── 📊 File A     │
│  └── 📊 File B     │
└──────────────────┘
```

### 12.2 Search System

```
Global Search Bar (Top Bar):
┌──────────────────────────────────────────┐
│  🔍 ค้นหาไฟล์, โฟลเดอร์...              │
└──────────────────────────────────────────┘
         │
         ▼ (พิมพ์ตั้งแต่ 2 ตัวอักษร)
┌──────────────────────────────────────────┐
│  Search Results                           │
│                                            │
│  📁 Folders                               │
│  ├── 📁 QC Line Report                    │
│  └── 📁 QC Load                           │
│                                            │
│  📊 Files                                 │
│  ├── 📊 IR LINE PF1-09  (in QC Line)     │
│  ├── 📊 IR Load-09      (in QC Load)     │
│  └── 📊 NRFT2026-09-PF1 (in Production)  │
│                                            │
│  Show all results →                       │
└──────────────────────────────────────────┘

Search Features:
├── Debounced input (300ms)
├── Fuzzy match (Levenshtein distance)
├── Highlight matched text
├── Filter by: type (folder/file), creator, date range
├── Recent searches (stored locally)
├── Search within file data (optional, full-text search on cell values)
└── Keyboard: Ctrl+K เปิด search bar
```

---

## 13. UI/UX Design Specification

### 13.1 Design Language

```
Design System: "DataSheet Pro"
├── Style: Modern Enterprise + SharePoint-inspired file management
├── Palette: Blue primary (#3B82F6 default, customizable)
├── Typography: Inter (default), Thai: Prompt/Sarabun
├── Icons: Lucide Icons (consistent, clean, open-source)
├── Border Radius: 8px default (customizable 0-20px)
├── Shadows: subtle, layered
│   ├── sm: 0 1px 2px rgba(0,0,0,0.05)
│   ├── md: 0 4px 6px rgba(0,0,0,0.07)
│   └── lg: 0 10px 15px rgba(0,0,0,0.1)
└── Motion: purposeful, 200-400ms, ease-out
```

### 13.2 Animation Catalog

| Context | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| **Page Transition** | Fade + slide left | 300ms | ease-out |
| **File Open** | Card expand → skeleton → fade-in data | 500ms total | spring |
| **Modal Open** | Scale 0.95→1 + fade | 200ms | ease-out |
| **Modal Close** | Scale 1→0.95 + fade | 150ms | ease-in |
| **Dropdown Open** | Slide down + fade | 200ms | ease-out |
| **Toast Notification** | Slide from right + fade | 300ms | spring |
| **Favorite Star** | Scale bounce 1→1.3→1 + rotate | 400ms | spring |
| **Loading Skeleton** | Shimmer gradient sweep | 1.5s loop | linear |
| **Row Add** | Slide down + fade in | 250ms | ease-out |
| **Row Delete** | Slide left + fade + height collapse | 300ms | ease-in |
| **Tab Switch** | Underline slide + content crossfade | 250ms | ease-out |
| **Sidebar Toggle** | Width 260→0 + content fade | 300ms | ease-in-out |
| **Zoom** | Smooth scale transform | 150ms | ease-out |
| **Access Request Submit** | Button → spinner → checkmark | 600ms | spring |
| **Sort Apply** | Rows reorder with stagger | 300ms stagger 10ms | ease-out |

### 13.3 Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Desktop XL | ≥1440px | Full layout, sidebar expanded |
| Desktop | ≥1024px | Full layout, sidebar collapsible |
| Tablet | ≥768px | Sidebar overlay, table horizontal scroll |
| Mobile | <768px | Bottom nav, stacked layout, card view for data |

### 13.4 Component Architecture

```
UI Component Hierarchy:

AppShell
├── TopBar
│   ├── Logo
│   ├── GlobalSearch
│   ├── NotificationBell
│   └── UserMenu
├── Sidebar
│   ├── FavoritesSection
│   ├── FolderTree
│   ├── RecentFiles
│   └── SidebarFooter
└── MainContent
    ├── BreadcrumbNav
    ├── PageHeader (title + actions)
    └── ContentArea
        ├── FileManagerView (Home / Folder view)
        │   ├── FileGrid / FileList
        │   ├── ActivityFeed
        │   └── EmptyState
        ├── SpreadsheetView (File open)
        │   ├── SheetTabs
        │   ├── FilterBar
        │   ├── TableContainer
        │   │   ├── ColumnHeaders (resizable, sortable)
        │   │   ├── FrozenPane
        │   │   ├── DataGrid (virtualized rows)
        │   │   └── AddRowButton
        │   ├── ZoomControl
        │   └── StatusBar
        ├── DashboardView
        │   ├── DashboardCanvas
        │   ├── WidgetToolbox
        │   └── WidgetConfigPanel
        ├── AuditLogView
        ├── AccessControlView
        ├── UserManagementView (Admin)
        └── SettingsView
            ├── ThemeCustomizer
            ├── FontSelector
            └── ProfileSettings
```

---

## 14. API Specification

### 14.1 API Convention

```
Base URL: /api/v1
Auth: Bearer JWT token in Authorization header
Content-Type: application/json
Response format:
{
  "success": boolean,
  "data": any | null,
  "message": string | null,
  "error": { code: string, details: any } | null,
  "pagination": { page, limit, total, totalPages } | null
}
```

### 14.2 API Endpoints

#### Auth

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/auth/login` | เข้าสู่ระบบ | Public |
| POST | `/auth/logout` | ออกจากระบบ | All |
| POST | `/auth/refresh` | Refresh token | All |
| POST | `/auth/change-password` | เปลี่ยนรหัสผ่าน | All |

#### Users

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/users` | รายชื่อ user ทั้งหมด | Admin |
| GET | `/users/:id` | ข้อมูล user | Admin |
| POST | `/users` | สร้าง user | Admin |
| PUT | `/users/:id` | แก้ไข user | Admin |
| PATCH | `/users/:id/status` | เปลี่ยนสถานะ active/inactive | Admin |
| PATCH | `/users/:id/role` | เปลี่ยน role | Admin |
| GET | `/users/me` | ข้อมูลตัวเอง | All |
| PUT | `/users/me` | แก้ไขข้อมูลตัวเอง | All |

#### Folders

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/folders` | Root folders (ที่มีสิทธิ์) | All |
| GET | `/folders/:id` | Folder detail + children | All |
| GET | `/folders/:id/tree` | Folder tree (recursive) | All |
| POST | `/folders` | สร้าง folder | Master, Admin |
| PUT | `/folders/:id` | แก้ไข folder | Master (own), Admin |
| DELETE | `/folders/:id` | ลบ folder (soft) | Master (own), Admin |
| PATCH | `/folders/:id/move` | ย้าย folder | Master (own), Admin |

#### Files

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/folders/:folderId/files` | ไฟล์ใน folder | All (ที่มีสิทธิ์) |
| GET | `/files/:id` | File detail + sheets | All (ที่มีสิทธิ์) |
| POST | `/files` | สร้างไฟล์ | Master, Admin |
| PUT | `/files/:id` | แก้ไขไฟล์ | Master (own), Admin |
| DELETE | `/files/:id` | ลบไฟล์ (soft) | Master (own), Admin |
| POST | `/files/:id/duplicate` | คัดลอกไฟล์ | Master, Admin |
| PATCH | `/files/:id/move` | ย้ายไฟล์ | Master (own), Admin |

#### Sheets

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/files/:fileId/sheets` | Sheet list | All (ที่มีสิทธิ์) |
| GET | `/sheets/:id` | Sheet detail + columns | All (ที่มีสิทธิ์) |
| POST | `/files/:fileId/sheets` | สร้าง sheet | Master, Admin |
| PUT | `/sheets/:id` | แก้ไข sheet (ชื่อ, สี, ลำดับ) | Master (own), Admin |
| DELETE | `/sheets/:id` | ลบ sheet | Master (own), Admin |

#### Columns

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/sheets/:sheetId/columns` | Column list | All |
| POST | `/sheets/:sheetId/columns` | สร้าง column | Master, Admin |
| PUT | `/columns/:id` | แก้ไข column | Master (own), Admin |
| DELETE | `/columns/:id` | ลบ column | Master (own), Admin |
| PATCH | `/columns/reorder` | เรียงลำดับ column | Master (own), Admin |
| PATCH | `/columns/:id/freeze` | Freeze/unfreeze column | All |

#### Rows & Cells (Data)

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/sheets/:sheetId/rows` | ข้อมูลแถว (paginated, filtered, sorted) | All (read+) |
| POST | `/sheets/:sheetId/rows` | เพิ่มแถว | All (write+) |
| PUT | `/rows/:id` | แก้ไขทั้งแถว | All (write+) |
| DELETE | `/rows/:id` | ลบแถว (soft) | All (write+) |
| PATCH | `/cells/:id` | แก้ไขเซลล์เดียว | All (write+) |
| POST | `/sheets/:sheetId/rows/bulk` | เพิ่มหลายแถว | All (write+) |
| PATCH | `/sheets/:sheetId/cells/bulk` | แก้ไขหลายเซลล์ | All (write+) |
| DELETE | `/sheets/:sheetId/rows/bulk` | ลบหลายแถว | All (write+) |

**Query Parameters for GET /rows:**

```
?page=1
&limit=50
&sort=column_id:asc,column_id2:desc
&filter[column_id]=value
&filter[column_id][gte]=100
&filter[column_id][lte]=500
&filter[column_id][contains]=keyword
&filter[column_id][in]=val1,val2,val3
&search=keyword  (full-text search across all text columns)
```

#### Access Control

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/files/:id/access` | สิทธิ์ไฟล์ | Master (own), Admin |
| POST | `/files/:id/access` | เพิ่มสิทธิ์ | Master (own), Admin |
| PUT | `/files/:id/access/:userId` | แก้ไขสิทธิ์ | Master (own), Admin |
| DELETE | `/files/:id/access/:userId` | ลบสิทธิ์ | Master (own), Admin |
| POST | `/access-requests` | ส่งคำขอเข้าถึง | All |
| GET | `/access-requests` | คำขอทั้งหมด (ของตัวเอง/ที่ต้อง approve) | All |
| PATCH | `/access-requests/:id/approve` | อนุมัติ | Master (own), Admin |
| PATCH | `/access-requests/:id/reject` | ปฏิเสธ | Master (own), Admin |

#### Audit & Rollback

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/audit-logs` | Audit log (filtered) | Master (own files), Admin |
| GET | `/cells/:id/history` | ประวัติเซลล์ | Master, Admin |
| GET | `/rows/:id/snapshots` | Snapshots ของแถว | Master, Admin |
| POST | `/cells/:id/rollback` | Rollback เซลล์ | Master (own), Admin |
| POST | `/rows/:id/rollback` | Rollback แถว | Master (own), Admin |
| POST | `/sheets/:id/rollback` | Rollback sheet (point-in-time) | Admin |

#### Favorites

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/favorites` | Favorites ของตัวเอง | All |
| POST | `/favorites` | เพิ่ม favorite | All |
| DELETE | `/favorites/:id` | ลบ favorite | All |

#### Dashboards

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/files/:fileId/dashboards` | Dashboard list | All (read+) |
| GET | `/dashboards/:id` | Dashboard detail + widgets | All (read+) |
| POST | `/files/:fileId/dashboards` | สร้าง dashboard | Master, Admin |
| PUT | `/dashboards/:id` | แก้ไข dashboard layout | Master (own), Admin |
| DELETE | `/dashboards/:id` | ลบ dashboard | Master (own), Admin |
| POST | `/dashboards/:id/widgets` | เพิ่ม widget | Master, Admin |
| PUT | `/widgets/:id` | แก้ไข widget | Master (own), Admin |
| DELETE | `/widgets/:id` | ลบ widget | Master (own), Admin |
| GET | `/dashboards/:id/data` | ดึงข้อมูลสำหรับ charts | All (read+) |

#### Theme

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/themes/me` | Theme ของตัวเอง | All |
| PUT | `/themes/me` | บันทึก theme | All |
| GET | `/themes/fonts` | รายชื่อ Google Fonts | All |

#### Search

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/search?q=keyword&type=file,folder` | Global search | All (ตามสิทธิ์) |

#### Notifications

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/notifications` | แจ้งเตือนของตัวเอง | All |
| PATCH | `/notifications/:id/read` | อ่านแล้ว | All |
| PATCH | `/notifications/read-all` | อ่านทั้งหมด | All |

---

## 15. Flow Diagrams

### 15.1 Main Application Flow

```
┌───────────────────────────────────────────────────────────────┐
│                        Login Page                              │
│                   ┌──────────────┐                             │
│                   │  Login Form  │                             │
│                   └──────┬───────┘                             │
│                          │ auth success                        │
└──────────────────────────┼────────────────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────────────────┐
│                    Main Application                            │
│                          │                                     │
│  ┌───────────┐    ┌──────▼───────┐    ┌───────────────────┐  │
│  │           │    │              │    │                     │  │
│  │  Sidebar  │◀──▶│  Home Page   │───▶│  File Manager     │  │
│  │           │    │  (Activity)  │    │  (Folder Browser)  │  │
│  │           │    │              │    │                     │  │
│  └───────────┘    └──────────────┘    └─────────┬─────────┘  │
│                                                  │             │
│                          ┌───────────────────────┤             │
│                          │                       │             │
│                   ┌──────▼──────┐         ┌──────▼──────┐     │
│                   │ Open File   │         │ Create File │     │
│                   │ (Table View)│         │ (Builder)   │     │
│                   └──────┬──────┘         └─────────────┘     │
│                          │                                     │
│           ┌──────────────┼──────────────┐                     │
│           │              │              │                     │
│    ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐            │
│    │  Data Entry │ │ Dashboard │ │   Audit     │            │
│    │  (Table)    │ │  Builder  │ │   Log       │            │
│    └─────────────┘ └───────────┘ └─────────────┘            │
│                                                                │
│  ┌───────────────────────────────────────────────────┐       │
│  │  Admin Panel (Admin only)                          │       │
│  │  ├── User Management                              │       │
│  │  ├── Global Settings                              │       │
│  │  └── System Audit Log                             │       │
│  └───────────────────────────────────────────────────┘       │
│                                                                │
│  ┌───────────────────────────────────────────────────┐       │
│  │  Settings (All users)                              │       │
│  │  ├── Profile                                      │       │
│  │  ├── Theme Customization                          │       │
│  │  └── Notification Preferences                     │       │
│  └───────────────────────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────┘
```

### 15.2 Data Entry Flow

```
User เปิดไฟล์ที่มีสิทธิ์ write
    │
    ▼
┌──────────────────┐
│  Load Sheet Data │──── GET /sheets/:id + GET /rows
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Display Table   │──── render virtualized rows
└────────┬─────────┘
         │
         ├── User คลิกเซลล์
         │   │
         │   ▼
         │   ┌──────────────────┐
         │   │  Edit Cell       │──── render input ตาม data_type
         │   └────────┬─────────┘
         │            │
         │            ├── Validate input (client-side)
         │            │   ├── Required check
         │            │   ├── Type check
         │            │   └── Custom validation rules
         │            │
         │            ├── ❌ Validation fail → show error
         │            │
         │            ├── ✅ Validation pass
         │            │   │
         │            │   ▼
         │            │   ┌──────────────────┐
         │            │   │  PATCH /cells/:id │──── send to server
         │            │   └────────┬─────────┘
         │            │            │
         │            │            ├── Server validates again
         │            │            ├── Save to Cells table
         │            │            ├── Save old value to CellHistory
         │            │            ├── Write AuditLog entry
         │            │            └── Return success
         │            │
         │            ▼
         │   ┌──────────────────┐
         │   │  Update UI       │──── optimistic update (instant)
         │   │  + Toast success │     reconcile with server response
         │   └──────────────────┘
         │
         ├── User เพิ่มแถว
         │   │
         │   ▼
         │   POST /sheets/:sheetId/rows
         │   ├── Validate required fields
         │   ├── Create Row + Cells
         │   ├── AuditLog entry
         │   └── Return new row data
         │
         └── User ลบแถว
             │
             ▼
             DELETE /rows/:id
             ├── Save RowSnapshot (before_delete)
             ├── Soft delete (is_deleted = 1)
             ├── AuditLog entry
             └── Return success
```

### 15.3 Access Request Flow (Detailed)

```
┌───────────┐                   ┌────────────┐              ┌───────────┐
│   User    │                   │   Server   │              │  Owner/   │
│           │                   │            │              │  Admin    │
└─────┬─────┘                   └──────┬─────┘              └─────┬─────┘
      │                                │                          │
      │  POST /access-requests         │                          │
      │  {file_id, permission, note}   │                          │
      │───────────────────────────────▶│                          │
      │                                │                          │
      │                                │  Validate:               │
      │                                │  - file exists            │
      │                                │  - user ไม่มีสิทธิ์อยู่แล้ว│
      │                                │  - ไม่มี pending request   │
      │                                │                          │
      │                                │  Create AccessRequest    │
      │                                │  (status: pending)       │
      │                                │                          │
      │                                │  Send Notification       │
      │                                │  (WebSocket + DB)        │
      │                                │─────────────────────────▶│
      │                                │                          │
      │  200 OK                        │              🔔 Notification
      │◀───────────────────────────────│              "User A ขอ  │
      │                                │              เข้าถึงไฟล์ X"│
      │                                │                          │
      │                                │                          │
      │                                │  PATCH /access-requests/ │
      │                                │  :id/approve             │
      │                                │  {review_note}           │
      │                                │◀─────────────────────────│
      │                                │                          │
      │                                │  Update status: approved │
      │                                │  Create FileAccess entry │
      │                                │  Send Notification       │
      │                                │                          │
      │  🔔 "คำขอได้รับอนุมัติ"        │                          │
      │◀───────────────────────────────│                          │
      │                                │                          │
      │  User can now access file      │                          │
      ▼                                ▼                          ▼
```

### 15.4 Dashboard Data Flow

```
User เปิด Dashboard
    │
    ▼
┌──────────────────────────┐
│  GET /dashboards/:id     │──── โหลด dashboard config + widgets
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  For each widget:        │
│  GET /dashboards/:id/data│──── ดึงข้อมูลจาก data_source config
│  {                       │
│    sheet_id,             │
│    columns: [col_ids],   │
│    aggregation: "SUM",   │
│    group_by: col_id,     │
│    filters: [...]        │
│  }                       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Server processes:       │
│  1. Check access rights  │
│  2. Query cells with     │
│     aggregation          │
│  3. Return formatted     │
│     chart data           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Render widgets on canvas│
│  ├── Position by (x,y)  │
│  ├── Size by (w,h)      │
│  ├── z-index for overlay │
│  └── Chart.js / Recharts │
└──────────────────────────┘
```

---

## 16. Non-Functional Requirements

### 16.1 Performance

| Metric | Target |
|--------|--------|
| Page Load (First Contentful Paint) | < 1.5s |
| Table Render (1,000 rows) | < 500ms |
| Cell Edit Round-trip | < 200ms (optimistic update) |
| Search Response | < 300ms |
| Dashboard Chart Render | < 1s |
| API Response (95th percentile) | < 500ms |
| Concurrent Users | 200+ |

### 16.2 Table Virtualization

```
ใช้ row virtualization (TanStack Virtual):
├── Render เฉพาะ rows ที่อยู่ใน viewport
├── Overscan: 10 rows above/below viewport
├── Estimated row height: 36px (adjustable)
├── Total rows supported: 100,000+
└── Column virtualization สำหรับ > 50 columns
```

### 16.3 Security

| Measure | Implementation |
|---------|----------------|
| Authentication | JWT + Refresh Token (HttpOnly cookie) |
| Password | bcrypt hash (12 rounds) |
| API Rate Limit | 100 req/min per user (configurable) |
| Input Sanitization | Server-side validation (zod) + parameterized queries |
| SQL Injection | Parameterized queries via mssql library (no string concat) |
| XSS | Content-Security-Policy headers + output encoding |
| CORS | Whitelist origin |
| HTTPS | TLS 1.2+ enforced |
| Session | Redis-backed session store |
| Audit | ทุก action ถูกบันทึก + IP + User Agent |

### 16.4 Scalability

```
Caching Strategy:
├── Redis cache สำหรับ:
│   ├── User session & permissions (TTL: 15 min)
│   ├── Folder tree structure (TTL: 5 min)
│   ├── Column definitions (TTL: 10 min)
│   └── Dashboard config (TTL: 5 min)
├── Cache invalidation: event-driven (on write)
└── No cache: cell data (always fresh)

Database Optimization:
├── Indexes ตามที่กำหนดใน schema
├── Stored Procedures สำหรับ complex queries
├── Pagination ทุก list endpoint
├── Connection pooling (mssql pool: min 5, max 50)
└── Read replicas สำหรับ report/dashboard queries (optional)
```

### 16.5 Backup & Recovery

```
├── Database backup:
│   ├── Full backup: daily
│   ├── Differential: every 4 hours
│   ├── Transaction log: every 15 minutes
│   └── Retention: 30 days
├── Application-level:
│   ├── CellHistory เก็บทุก cell change
│   ├── RowSnapshots เก็บทุก row state change
│   └── AuditLog เก็บทุก action
└── Point-in-time recovery:
    ├── DB level: SQL Server PITR
    └── App level: Sheet rollback (ผ่าน CellHistory)
```

---

## 17. Deployment & DevOps

### 17.1 Docker Compose Architecture

```yaml
# docker-compose.yml (simplified)
services:
  client:
    build: ./client
    ports: ["3000:3000"]
    depends_on: [server]

  server:
    build: ./server
    ports: ["4000:4000"]
    depends_on: [mssql, redis]
    environment:
      - DB_HOST=mssql
      - REDIS_HOST=redis

  mssql:
    image: mcr.microsoft.com/mssql/server:2022-latest
    ports: ["1433:1433"]
    volumes: ["mssql-data:/var/opt/mssql"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    depends_on: [client, server]
```

### 17.2 Environment Configuration

```
# .env.production
NODE_ENV=production
PORT=4000

# Database
DB_HOST=172.48.0.116
DB_PORT=1433
DB_NAME=datasheet_pro
DB_USER=sa
DB_PASSWORD=<secure>
DB_POOL_MIN=5
DB_POOL_MAX=50

# Auth
JWT_SECRET=<secure-random-256bit>
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d

# Redis
REDIS_HOST=172.48.0.116
REDIS_PORT=6379
REDIS_PASSWORD=<secure>

# App
CORS_ORIGIN=https://yourdomain.com
MAX_FILE_UPLOAD_SIZE=10MB
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Google Fonts
GOOGLE_FONTS_API_KEY=<key>
```

---

## 18. Development Phases

### Phase 1: Foundation (4-6 weeks)

```
├── Project setup (React + Node.js + SQL Server + Docker)
├── Database schema creation + migrations
├── Auth system (login, JWT, refresh, RBAC middleware)
├── User management (CRUD, role assignment) — Admin panel
├── Basic folder management (create, rename, delete, tree view)
├── Basic file creation (name, folder, single sheet)
└── Basic table rendering (static columns, view-only)
```

### Phase 2: Core Spreadsheet (4-6 weeks)

```
├── Dynamic column builder (all data types)
├── Cell editing (inline edit, validation)
├── Row CRUD (add, edit, delete, bulk operations)
├── Sort system (per-column dropdown with search)
├── Filter system (multi-value filter per column)
├── Required field validation
├── Multiple sheets per file (tab management)
├── Column resize + row resize
└── Pagination
```

### Phase 3: Advanced Table & Access Control (3-4 weeks)

```
├── Freeze columns/rows
├── Zoom in/out + fullscreen
├── Table keyboard shortcuts
├── File access control (grant/revoke)
├── Folder access control
├── Access request system (with notes)
├── Notification system (in-app)
└── WebSocket real-time notifications
```

### Phase 4: Audit & Rollback (2-3 weeks)

```
├── Audit log (write on every action)
├── Audit log viewer UI (filters, pagination)
├── Cell history tracking
├── Cell-level rollback
├── Row snapshots
├── Row-level rollback
└── Sheet-level rollback (Admin)
```

### Phase 5: File Manager & Favorites (2-3 weeks)

```
├── SharePoint-like file manager UI
├── Grid / List / Tree view toggle
├── Drag & drop file/folder move
├── File duplicate
├── Breadcrumb navigation
├── Global search (fuzzy match)
├── Favorites system (star toggle)
├── Recent files
├── Activity feed
└── Open file animation
```

### Phase 6: Dashboard Builder (4-5 weeks)

```
├── Dashboard canvas (free-form layout)
├── Widget toolbox
├── Chart widgets (bar, line, pie, area, scatter)
├── KPI cards
├── Data source configuration UI
├── Aggregation & group-by
├── Text box & image widgets
├── Box/shape overlay
├── Widget resize & drag
├── z-index management
└── Dashboard CRUD
```

### Phase 7: UI Customization & Polish (2-3 weeks)

```
├── Theme customizer panel
├── Color picker (primary, secondary, accent, etc.)
├── Google Fonts selector + preview
├── Border radius / gap / sidebar width controls
├── Dark mode
├── CSS variable engine
├── Animation polish (all transitions)
├── Responsive design (tablet, mobile)
├── Loading skeletons everywhere
└── Empty states design
```

### Phase 8: Testing & Hardening (2-3 weeks)

```
├── Unit tests (Jest: services, utilities)
├── Integration tests (API endpoints)
├── E2E tests (Playwright: critical flows)
├── Performance testing (k6: load test)
├── Security audit (OWASP checklist)
├── Accessibility audit (WCAG 2.1 AA)
├── Cross-browser testing (Chrome, Firefox, Edge, Safari)
├── Bug fixes & optimization
└── Documentation finalization
```

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| File | เอกสาร/workbook ที่ประกอบด้วยหลาย Sheet |
| Sheet | แท็บข้อมูล (เหมือน sheet ใน Excel) ภายใน File |
| Column | คอลัมน์ที่กำหนด data type และ validation |
| Row | แถวข้อมูลใน Sheet |
| Cell | จุดตัดระหว่าง Row กับ Column (เก็บค่าจริง) |
| Folder | โฟลเดอร์สำหรับจัดกลุ่ม File |
| Widget | Component บน Dashboard (chart, KPI, image, etc.) |
| Rollback | การย้อนกลับข้อมูลไปยัง version ก่อนหน้า |
| RBAC | Role-Based Access Control |

## Appendix B: Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 1: Foundation | 4-6 weeks | 4-6 weeks |
| Phase 2: Core Spreadsheet | 4-6 weeks | 8-12 weeks |
| Phase 3: Advanced Table & Access | 3-4 weeks | 11-16 weeks |
| Phase 4: Audit & Rollback | 2-3 weeks | 13-19 weeks |
| Phase 5: File Manager & Favorites | 2-3 weeks | 15-22 weeks |
| Phase 6: Dashboard Builder | 4-5 weeks | 19-27 weeks |
| Phase 7: UI Customization | 2-3 weeks | 21-30 weeks |
| Phase 8: Testing & Hardening | 2-3 weeks | 23-33 weeks |
| **Total Estimated** | **23-33 weeks** | **~6-8 months** |

> **หมายเหตุ:** ระยะเวลาประมาณการสำหรับทีม 2-3 full-stack developers + 1 UI/UX designer ทำงานเต็มเวลา

---

*Document generated for DataSheet Pro — Production-level System Specification v1.0.0*
