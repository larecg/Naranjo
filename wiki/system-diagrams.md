# System Diagrams

## Component Architecture Diagram

```mermaid
graph TB
    subgraph "Browser Extension"
        subgraph "UI Layer"
            PU[Popup UI<br/>index.html + src/app/]
            OP[Options Page<br/>options.html + src/options/]
            CS[Content Script<br/>src/contentScript/]
        end

        subgraph "Background Worker"
            BGI[Background Index<br/>src/background/index.ts]
            BGS[State<br/>src/background/state.ts]
            BGQ[Task Queue<br/>src/background/taskQueue.ts]
            BGC[Context Menu<br/>src/background/contextMenu.ts]
            BGK[Command Handler<br/>src/background/commandHandler.ts]
        end

        subgraph "Service Layer"
            SVC_OL[Ollama Service]
            SVC_OAI[OpenAI Service]
            SVC_GG[Google Service]
            SVC_AN[Anthropic Service]
            SVC_MI[Mistral Service]
            SVC_XAI[xAI Service]
            SVC_DS[DeepSeek Service]
            SVC_CB[Chrome Built-in Service]
        end

        subgraph "Data Layer"
            DAO_CTX[NaranjoContextDAO<br/>IndexedDB: Contexts]
            DAO_TASK[NaranjoTaskDAO<br/>IndexedDB: Tasks]
            DAO_PROV[ProviderConfigDAO<br/>Chrome Storage]
        end
    end

    subgraph "External Systems"
        OL[Ollama Server<br/>localhost]
        CLOUD[Cloud LLM APIs<br/>OpenAI / Google / etc.]
        WP[Web Pages<br/>DOM]
    end

    %% UI ↔ Background
    PU <-->|runtime.sendMessage| BGI
    OP <-->|runtime.sendMessage| BGI
    CS <-->|runtime.sendMessage| BGI

    %% Background internal
    BGI --> BGS
    BGI --> BGQ
    BGI --> BGC
    BGI --> BGK

    %% Background ↔ Services
    BGS --> SVC_OL & SVC_OAI & SVC_GG & SVC_AN & SVC_MI & SVC_XAI & SVC_DS & SVC_CB
    BGQ --> SVC_OL & SVC_OAI & SVC_GG & SVC_AN & SVC_MI & SVC_XAI & SVC_DS & SVC_CB

    %% Background ↔ DAO
    BGQ <--> DAO_TASK
    BGC <--> DAO_CTX
    BGS <--> DAO_PROV

    %% Services ↔ External
    SVC_OL <-->|HTTP| OL
    SVC_OAI & SVC_GG & SVC_AN & SVC_MI & SVC_XAI & SVC_DS <-->|HTTPS| CLOUD

    %% Content Script ↔ DOM
    CS <--> WP

    %% Streaming
    BGQ -.->|long-lived port<br/>naranjo-stream-taskId| CS

    classDef ui fill:#e1f5fe
    classDef bg fill:#f3e5f5
    classDef svc fill:#e8f5e8
    classDef dao fill:#fff3e0
    classDef ext fill:#ffebee

    class PU,OP,CS ui
    class BGI,BGS,BGQ,BGC,BGK bg
    class SVC_OL,SVC_OAI,SVC_GG,SVC_AN,SVC_MI,SVC_XAI,SVC_DS,SVC_CB svc
    class DAO_CTX,DAO_TASK,DAO_PROV dao
    class OL,CLOUD,WP ext
```

## Data Flow Diagram - Context Menu Interaction

```mermaid
sequenceDiagram
    participant U as User
    participant WP as Web Page
    participant CS as Content Script
    participant BG as Background Worker
    participant DB as IndexedDB (TaskDAO)
    participant SVC as Provider Service

    U->>WP: Selects text + right-click
    WP->>BG: context menu click event
    BG->>DB: createTask (PENDING)
    DB-->>BG: taskId

    Note over BG: If queue is idle
    BG->>DB: updateTask (PROCESSING)
    BG->>SVC: sendPrompt (streaming)

    loop Token streaming
        SVC-->>BG: chunk
        BG-)CS: port.postMessage {event:"chunk", accumulated}
        CS->>WP: update streaming UI
    end

    SVC-->>BG: done
    BG->>DB: updateTask (COMPLETED, output)
    BG-)CS: port.postMessage {event:"done", fullContent}
    BG->>CS: tabs.sendMessage (replaceText / alertUser)
    CS->>WP: Update DOM / show toast
```

## Data Flow Diagram - Quick Menu Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CS as Content Script
    participant BG as Background Worker

    U->>CS: Alt+Shift+Q (keyboard shortcut)
    CS->>BG: requestSelectionFromPage
    BG->>CS: openQuickMenu {contexts, defaultContextId}
    CS->>U: Show quick menu overlay

    alt User picks a context
        U->>CS: Click context item
        CS->>BG: executeContext {contextId, selectionText}
        BG->>BG: Enqueue task
    else User enters custom prompt
        U->>CS: Type custom prompt + submit
        CS->>BG: executeCustomPrompt {customPrompt, selectionText}
        BG->>BG: Enqueue task
    end
```

## Data Flow Diagram - Configuration Management

```mermaid
sequenceDiagram
    participant U as User
    participant OP as Options Page
    participant BG as Background Worker
    participant PCFG as ProviderConfigDAO
    participant CS as Chrome Storage

    U->>OP: Enable provider / enter API key
    OP->>PCFG: saveProviderConfig(config)
    PCFG->>CS: storage.local.set(config)
    OP->>BG: reloadProviderConfigs
    BG->>PCFG: getAllProviderConfigs()
    PCFG-->>BG: configs[]
    BG->>BG: Refresh aggregated model list
    BG-->>OP: done
```

## Class Diagram

```mermaid
classDiagram
    class NaranjoContext {
        +string id
        +string title
        +string prompt
        +NaranjoAction action
        +string? modelId
    }

    class NaranjoTask {
        +string id
        +NaranjoAction action
        +string input
        +string prompt
        +string? output
        +TaskStatus status
        +number timestamp
        +number? tabId
        +string contextTitle
        +string? modelId
    }

    class TaskStatus {
        <<enumeration>>
        PENDING
        PROCESSING
        COMPLETED
        FAILED
    }

    class NaranjoAction {
        <<enumeration>>
        alertUser
        replaceText
        openQuickMenu
        executeContext
        executeDefaultContext
        requestSelectionFromPage
        getTaskHistory
        deleteTask
        clearTaskHistory
        dismissAlert
        executeCustomPrompt
        openCustomPromptInput
    }

    class LLMModel {
        +string id
        +string name
        +ProviderType providerId
    }

    class ProviderConfig {
        <<union type>>
        OllamaProviderConfig
        OpenAIProviderConfig
        GoogleProviderConfig
        AnthropicProviderConfig
        MistralProviderConfig
        XAIProviderConfig
        DeepSeekProviderConfig
        ChromeBuiltinProviderConfig
    }

    class BaseProviderConfig {
        +ProviderType id
        +string name
        +boolean enabled
    }

    class BackgroundState {
        -LLMModel[] models
        -string selectedModel
        -string defaultContextId
        +loadProviderConfigs()
        +aggregateModels()
    }

    class TaskQueue {
        -boolean isProcessing
        +enqueueTask(task)
        +processNextTask()
        +routeToProvider(task)
    }

    class ContextMenu {
        +setupContextMenu(contexts)
    }

    class ProviderService {
        <<interface>>
        +getListOfModels(config) LLMModel[]
        +sendPrompt(params) string
    }

    NaranjoContext --> NaranjoAction
    NaranjoTask --> NaranjoAction
    NaranjoTask --> TaskStatus
    NaranjoTask --> LLMModel
    LLMModel --> ProviderConfig
    ProviderConfig --> BaseProviderConfig
    TaskQueue --> ProviderService
    BackgroundState --> ProviderService
    BackgroundState --> ProviderConfig
```

## System Context Diagram

```mermaid
graph TB
    subgraph "User Environment"
        U[User]
        B[Browser]
    end

    subgraph "Naranjo Extension"
        OE[Extension System]
    end

    subgraph "Local LLM"
        OS[Ollama Server]
        CB[Chrome Built-in AI]
        LM[Local Models]
    end

    subgraph "Cloud LLM APIs"
        OAI[OpenAI]
        GG[Google Gemini]
        AN[Anthropic Claude]
        MI[Mistral AI]
        XAI[xAI Grok]
        DS[DeepSeek]
    end

    subgraph "Web Content"
        WS[Websites]
        WP[Web Pages]
    end

    U --> B
    B --> OE
    B --> WS
    WS --> WP
    OE <--> OS & CB
    OS --> LM
    OE <-->|user opt-in| OAI & GG & AN & MI & XAI & DS
    OE <--> WP

    classDef user fill:#e3f2fd
    classDef system fill:#f3e5f5
    classDef local fill:#e8f5e8
    classDef cloud fill:#fff8e1
    classDef web fill:#fce4ec

    class U,B user
    class OE system
    class OS,CB,LM local
    class OAI,GG,AN,MI,XAI,DS cloud
    class WS,WP web
```

## State Machine - Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Task enqueued

    PENDING --> PROCESSING: Queue picks up task
    PROCESSING --> COMPLETED: LLM response received
    PROCESSING --> FAILED: API error / timeout

    COMPLETED --> [*]: Side-effect applied\n(replaceText / alertUser)
    FAILED --> [*]: Error toast shown

    note right of PENDING
        Persisted in IndexedDB
        Survives worker restart
    end note

    note right of PROCESSING
        Only one task at a time
        Streaming via port
    end note
```

## State Machine - Extension Initialization

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> LoadingProviderConfigs: onInstalled / onStartup
    LoadingProviderConfigs --> LoadingModels: configs loaded
    LoadingModels --> LoadingContexts: models aggregated
    LoadingContexts --> ResumingQueue: contexts loaded
    ResumingQueue --> Ready: pending tasks checked

    Ready --> Processing: context menu click\nor keyboard shortcut
    Processing --> Ready: task enqueued
    Ready --> Updating: context modified
    Updating --> Ready: context menu rebuilt

    note right of Ready
        Context menu visible
        Quick menu available
        All systems operational
    end note

    note right of ResumingQueue
        Picks up PENDING tasks
        that survived a worker restart
    end note
```

## Component Communication Flow

```mermaid
graph LR
    subgraph "Extension Components"
        PU[Popup UI]
        OP[Options Page]
        CS[Content Script]
        BG[Background Worker]
    end

    subgraph "Message Types"
        API[APIMessages\nrequest-response]
        PUSH[ResponseAPIMessage\npush from BG]
        PORT[StreamPortMessage\nlong-lived port]
        EVENT[Browser Events\ncommands, contextMenus]
    end

    subgraph "External"
        OL[Ollama / Cloud APIs]
        DOM[Web Page DOM]
        STOR[IndexedDB / Chrome Storage]
    end

    PU -.->|API| BG
    OP -.->|API| BG
    CS -.->|API| BG
    BG -.->|PUSH| CS
    BG -.->|PORT streaming| CS

    BG <-->|HTTP/HTTPS| OL
    CS <-->|Manipulation| DOM
    BG <-->|Storage| STOR

    EVENT -.->|Context Menu Click| BG
    EVENT -.->|Alt+Shift+Q/R/O| BG

    classDef component fill:#e1f5fe
    classDef message fill:#f3e5f5
    classDef external fill:#e8f5e8

    class PU,OP,CS,BG component
    class API,PUSH,PORT,EVENT message
    class OL,DOM,STOR external
```
