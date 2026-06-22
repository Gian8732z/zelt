# Software Requirements Specification (SRS)
## Project: Tent Management PWA

### 1. System Overview
A Progressive Web Application (PWA) designed to manage damage reports and maintenance states for a fleet of 20 modular Spatz tents. The system prioritizes a frictionless, offline-capable reporting experience for camp participants and a centralized, authenticated management dashboard for the quartermaster (Materialwart). By streamlining the reporting process, the application ensures accurate tracking of J+S (Jugend+Sport) material, prolongs the lifespan of the equipment, and reduces operational overhead during fast-paced scout camps.

### 2. User Roles & Authentication

#### 2.1. Reporter (Camp Member)
* **Access Paradigm:** Frictionless and unauthenticated. Accessed via a secret, unguessable URL (e.g., distributed via a QR code printed on camp J+S material boxes or tent bags).
* **Permissions:** Write-only access to submit new damage reports. No capability to view historical data or other tents' statuses.
* **Network Constraint:** Must function entirely offline, queuing submissions locally.

#### 2.2. Manager (Quartermaster / Materialwart)
* **Access Paradigm:** Authenticated login (e.g., email/password or a secure admin passphrase).
* **Permissions:** Full Read/Write access to the entire fleet of tents, historical damage logs, and resolution states.
* **Network Constraint:** Requires an active internet connection to view the synchronized global state of the database and update records.

### 3. Functional Requirements

#### 3.1. Damage Reporting Workflow (Reporter Interface)
* **Tent Identification:** The user selects a tent by its designated number (1-20) from a highly visible, touch-friendly grid or dropdown.
* **Damage Selection:** The user selects one or more damaged or missing components from a predefined list of common Spatz tent issues.
* **Contextual Notes:** An optional free-text text area for additional, specific details regarding the damage.
* **Conditional Media Upload:** * If the device detects an active network connection (`navigator.onLine == true`), the form displays a file input allowing the user to snap or upload a photo of the damage.
    * If the device is offline, this field is explicitly hidden or disabled with a helpful tooltip indicating that photos cannot be queued offline.

#### 3.2. Offline Sync Engine (Progressive Web App Mechanics)
* **Service Worker:** The application utilizes a Service Worker to cache all static assets (HTML, CSS, JS, manifest) ensuring immediate UI load times regardless of network conditions.
* **Local Queuing:** Reports submitted while offline are serialized as JSON payloads and stored locally on the device utilizing IndexedDB.
* **Background Sync:** The application actively listens for the browser's `online` event. Upon restoration of connectivity, queued payloads are automatically transmitted to the backend API.

#### 3.3. Management Dashboard (Manager Interface)
* **Fleet Overview:** A centralized, tabular or grid view of all 20 tents indicating their current operational status (e.g., Green = Functional/Active, Red = Needs Repair).
* **Tent Detail View:** Selecting a specific tent reveals its complete historical log of damages, ordered chronologically. This facilitates tracking of long-term structural degradation over multiple camps.
* **Resolution Workflow:** The manager can transition active damage reports to a "Repaired/Replaced" state. This action reverts the tent's global status to functional while permanently retaining the damage record in the historical log.

### 4. Data Model Strategy

The architecture separates static inventory from dynamic events to maintain a lightweight database schema.

#### 4.1. Tents Entity
Acts as the single source of truth for the inventory.
* `tent_id` (Primary Key, Integer: 1-20)
* `status` (Computed/Enum: Active, Damaged, Out of Service)

#### 4.2. Damages Entity
An append-only log of events tied to specific tents.
* `report_id` (Primary Key, UUID)
* `tent_id` (Foreign Key -> Tents)
* `timestamp` (DateTime, UTC)
* `damage_categories` (Array of Strings / Preset Enums)
* `notes` (Text, Nullable)
* `photo_url` (String, Nullable)
* `status` (Enum: Open, Resolved)
* `resolution_timestamp` (DateTime, UTC, Nullable)
