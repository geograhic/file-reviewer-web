const state = {
  view: "dashboard",
  overview: null,
  config: null,
  lang: "zh-CN",
  onboardingStep: 0,
  items: [],
  libraries: [],
  decks: [],
  notes: [],
  activeNoteId: null,
  selectedNoteIds: new Set(),
  activeLibraryId: null,
  treeRel: "",
  commonPaths: [],
  plugins: [],
  social: null,
  links: [],
  filters: {
    search: "",
    status: "active",
    due: "all",
    sort: "due_at",
    direction: "asc",
    deckId: "",
  },
  selectedIds: new Set(),
  review: {
    item: null,
    sessionId: null,
    startedAt: null,
    timerId: null,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const EXTRA_I18N = {
  "actions.openTab": { "zh-CN": "新标签页", "en-US": "New tab" },
  "actions.linkSelection": { "zh-CN": "关联选中内容", "en-US": "Link selection" },
  "actions.renameDeck": { "zh-CN": "重命名", "en-US": "Rename" },
  "actions.subDeck": { "zh-CN": "子卡组", "en-US": "Subdeck" },
  "learningStats.title": { "zh-CN": "学习统计", "en-US": "Learning Stats" },
  "learningStats.subtitle": { "zh-CN": "学习进步可视化", "en-US": "Progress visualization" },
  "learningStats.reviews": { "zh-CN": "复习次数", "en-US": "Reviews" },
  "learningStats.time": { "zh-CN": "学习时长", "en-US": "Study time" },
  "learningStats.links": { "zh-CN": "内容关联", "en-US": "Links" },
  "links.title": { "zh-CN": "内容关联", "en-US": "Content Links" },
  "links.empty": { "zh-CN": "还没有关联。选中资料或笔记中的文字后，可以把它连接到其他资料或笔记。", "en-US": "No links yet. Select text in a file or note, then connect it to another file or note." },
  "links.target": { "zh-CN": "目标", "en-US": "Target" },
  "prompt.renameDeck": { "zh-CN": "输入新的卡组名称", "en-US": "Enter the new deck name" },
  "prompt.chooseLinkTarget": { "zh-CN": "输入要关联的资料/笔记关键词", "en-US": "Search files or notes to link" },
  "prompt.linkNote": { "zh-CN": "给这条关联添加一句说明（可留空）", "en-US": "Optional note for this link" },
  "toast.deckUpdated": { "zh-CN": "卡组已更新", "en-US": "Deck updated" },
  "toast.linkCreated": { "zh-CN": "已创建内容关联", "en-US": "Content link created" },
  "toast.noSelection": { "zh-CN": "请先选中一段文字", "en-US": "Select some text first" },
  "confirm.deleteLink": { "zh-CN": "确定删除这条关联？", "en-US": "Delete this link?" }
};

let I18N = {
  "zh-CN": {
    "brand.title": "文件复习",
    "nav.dashboard": "总览",
    "nav.library": "文件库",
    "nav.review": "复习",
    "nav.notes": "笔记",
    "nav.settings": "设置",
    "actions.chooseLibrary": "选择本地文件库",
    "actions.addLibrary": "添加文件库",
    "actions.scanAll": "扫描全部文件库",
    "actions.rescan": "重新扫描",
    "actions.startDue": "开始下一项复习",
    "actions.startReview": "开始复习",
    "actions.enter": "进入",
    "actions.exportCsv": "导出 CSV",
    "actions.openDefault": "用系统默认程序打开",
    "actions.openWith": "选择其他应用打开",
    "actions.openWithShort": "其他应用",
    "actions.openFile": "打开文件",
    "actions.openFolder": "打开所在文件夹",
    "actions.folder": "所在文件夹",
    "actions.note": "笔记",
    "actions.createLinkedNote": "为当前资料新建笔记",
    "actions.newNote": "新建笔记",
    "actions.newLocalNote": "本地方式新建",
    "actions.openNotesFolder": "打开笔记目录",
    "actions.saveNote": "保存笔记",
    "actions.next": "下一项",
    "actions.save": "保存",
    "actions.health": "体检",
    "actions.exportJson": "导出 JSON",
    "actions.exportProfile": "导出迁移包",
    "actions.backupDb": "备份数据库",
    "actions.scanPath": "扫描路径",
    "actions.chooseFolder": "选择文件夹",
    "actions.moveProfile": "迁移到此目录",
    "actions.importProfile": "导入迁移包",
    "actions.choosePackage": "选择迁移包",
    "actions.openProfileFolder": "打开数据目录",
    "actions.refresh": "刷新",
    "actions.close": "关闭",
    "actions.previous": "上一步",
    "actions.nextStep": "下一步",
    "actions.done": "完成",
    "actions.chooseLibraryNow": "现在选择文件库",
    "search.placeholder": "搜索文件、路径、标签",
    "metrics.dueToday": "今日到期",
    "metrics.waiting": "等待复习",
    "metrics.total": "全部资料",
    "metrics.localIndex": "本地索引",
    "metrics.reviewedToday": "今日已复习",
    "metrics.streak": "连续天数",
    "metrics.studyTrace": "学习轨迹",
    "dashboard.title": "总览",
    "dashboard.subtitle": "今日复习队列与文件库状态",
    "dashboard.queue": "复习队列",
    "dashboard.futureDue": "未来到期",
    "library.title": "文件库",
    "library.subtitle": "像 Obsidian 一样浏览本地资料，并批量加入复习系统",
    "library.localLibraries": "本地文件库",
    "library.manualPath": "手动添加文件夹路径",
    "library.manualPathPlaceholder": "例如 C:\\Users\\你的名字\\Documents\\资料库",
    "review.title": "复习",
    "review.subtitle": "按记忆曲线完成阅读、评价和下次提醒",
    "review.waiting": "等待开始",
    "review.chooseOne": "请选择一项资料开始复习",
    "review.previewTitle": "复习区",
    "review.previewHint": "打开资料后，这里会显示可预览文件或文件信息。",
    "review.ratingTitle": "完成评价",
    "review.history": "复习历史",
    "notes.title": "笔记",
    "notes.subtitle": "记录复习笔记，保存为真实 Markdown 文件",
    "notes.titlePlaceholder": "笔记标题",
    "notes.editorPlaceholder": "在这里记录复习笔记...",
    "notes.empty": "还没有笔记。可以新建一篇，或在复习时为当前资料建立关联笔记。",
    "settings.title": "设置",
    "settings.subtitle": "个性化界面、调度算法与本地配置路径",
    "settings.personalization": "个性化",
    "settings.algorithm": "算法",
    "settings.fixed": "固定间隔",
    "settings.retention": "目标记忆率",
    "settings.maxReviews": "每日复习上限",
    "settings.reminderTime": "提醒时间",
    "settings.reminderEnabled": "提醒开关",
    "settings.autoOpen": "复习开始时外部打开文件",
    "settings.notesDir": "笔记存储目录",
    "settings.localNoteOpen": "本地方式新建后打开所在文件夹",
    "settings.theme": "主题",
    "settings.accent": "强调色",
    "settings.language": "语言",
    "settings.customCss": "自定义 CSS",
    "settings.paths": "配置位置",
    "settings.profileDir": "主数据目录",
    "settings.importProfile": "导入迁移包路径",
    "theme.light": "明亮",
    "theme.dark": "深色",
    "theme.paper": "纸面",
    "paths.config": "配置文件",
    "paths.database": "数据库",
    "paths.appDir": "程序数据目录",
    "paths.log": "日志",
    "paths.plugins": "插件目录",
    "paths.notes": "笔记目录",
    "paths.pointer": "位置指针",
    "help.title": "帮助说明",
    "help.body": "复习开始默认只在软件内预览，不会自动打开本地默认程序。无法预览的格式可以点击“默认打开”或“其他应用”。笔记是真实 Markdown 文件，可在软件里编辑，也可用资源管理器和本地编辑器继续处理。",
    "plugins.title": "插件开发预留",
    "plugins.empty": "暂无插件。以后把插件文件夹放在这里即可。",
    "health.title": "长期稳定性体检",
    "health.hint": "点击体检，检查数据库、配置、资源文件和原始文件可见性。",
    "filters.all": "全部",
    "filters.due": "到期",
    "filters.new": "新资料",
    "filters.future": "未到期",
    "filters.status": "状态筛选",
    "status.active": "活动",
    "status.suspended": "暂停",
    "status.done": "完成",
    "status.all": "全部状态",
    "batch.tag": "批量标签",
    "batch.tagShort": "标签",
    "batch.suspend": "暂停或恢复",
    "batch.suspendShort": "暂停",
    "batch.activate": "恢复为活动",
    "batch.activateShort": "恢复",
    "batch.dueToday": "设为今天复习",
    "batch.todayShort": "今天",
    "batch.done": "标记完成",
    "batch.doneShort": "完成",
    "batch.delete": "删除索引记录",
    "batch.deleteShort": "删除",
    "table.file": "文件",
    "table.due": "到期",
    "table.retention": "记忆率",
    "table.count": "次数",
    "table.time": "时长",
    "table.actions": "操作",
    "ratings.again": "忘记",
    "ratings.againHint": "很快再看",
    "ratings.hard": "困难",
    "ratings.hardHint": "缩短间隔",
    "ratings.good": "良好",
    "ratings.goodHint": "正常推进",
    "ratings.easy": "简单",
    "ratings.easyHint": "拉长间隔",
    "onboarding.step1Title": "欢迎使用智能文件复习系统",
    "onboarding.step1Body": "它不会移动你的资料，只会索引本地文件，并按记忆曲线提醒你复习。",
    "onboarding.step2Title": "选择一个本地文件库",
    "onboarding.step2Body": "从你的 PDF、笔记、图片、视频文件夹开始。扫描后就能浏览、搜索和批量管理。",
    "onboarding.step3Title": "每天从“开始复习”进入",
    "onboarding.step3Body": "阅读资料后选择忘记、困难、良好或简单，系统会自动安排下一次复习。",
    "onboarding.stepAddFileTitle": "也可以添加单个文件",
    "onboarding.stepAddFileBody": "不必先建文件库，直接添加某一个 PDF、文档、图片或视频也行。",
    "onboarding.stepSettingsTitle": "在设置里个性化",
    "onboarding.stepSettingsBody": "调整复习算法、目标记忆率、每日上限、提醒时间、主题与强调色。",
    "onboarding.stepHelpTitle": "随时可在帮助里重开本引导",
    "onboarding.stepHelpBody": "点左侧“帮助”，随时重看快速入门，并重新开启新用户引导。",
    "actions.skipTour": "跳过引导",
    "actions.restartTour": "重新开始引导",
    "actions.finish": "完成",
    "help.restartTour": "开启新用户引导",
    "empty.noDueTitle": "今天没有到期资料",
    "empty.noDueBody": "可以浏览文件库添加新资料，或安心收工。",
    "empty.noFuture": "暂无未来到期数据。",
    "empty.noLibraryTitle": "还没有文件库",
    "empty.noLibraryBody": "点击添加文件库，选择你已有的资料文件夹。",
    "empty.noTree": "这个文件夹里没有可显示内容。",
    "empty.noItemsTitle": "没有匹配文件",
    "empty.noItemsBody": "调整筛选条件，或扫描一个本地文件库。",
    "empty.fileMissing": "文件不存在",
    "empty.noHistory": "暂无历史记录。",
    "labels.noTags": "无标签",
    "labels.fileMissing": "文件缺失",
    "labels.folder": "文件夹",
    "labels.unscanned": "未扫描",
    "labels.files": "个文件",
    "labels.reviewButton": "复习",
    "labels.reviewRound": "第 {count} 次",
    "labels.intervalDays": "间隔 {days} 天",
    "labels.report": "报告：{path}",
    "time.unscheduled": "未安排",
    "time.today": "今天 {time}",
    "time.tomorrow": "明天 {time}",
    "time.yesterday": "昨天 {time}",
    "toast.openingFolderPicker": "正在打开文件夹选择窗口...",
    "toast.cancelled": "已取消选择；你也可以直接粘贴文件夹路径后扫描。",
    "toast.pathRequired": "请先输入一个有效路径",
    "toast.profileMoved": "主数据目录已迁移：{path}",
    "toast.profileImported": "迁移包已导入，导入前备份：{path}",
    "toast.profileExported": "迁移包已导出：{path}",
    "toast.packageSelected": "已选择迁移包",
    "toast.noteCreated": "笔记已创建",
    "toast.noteSaved": "笔记已保存",
    "toast.noNoteSelected": "请先选择或新建一篇笔记",
    "toast.scanDone": "扫描完成：新增 {added}，更新 {updated}",
    "toast.scanAll": "正在扫描全部文件库...",
    "toast.scanAllDone": "扫描完成，处理 {count} 条记录",
    "toast.noDue": "当前没有到期资料",
    "toast.startFirst": "请先开始一项复习",
    "toast.reviewSaved": "已记录，下一次：{date}",
    "toast.selectFirst": "请先勾选文件",
    "toast.tagUpdated": "已更新 {count} 个文件的标签",
    "toast.suspended": "已暂停 {count} 个文件",
    "toast.statusChanged": "已{label} {count} 个文件",
    "toast.dueToday": "已设为今天复习：{count} 个文件",
    "toast.deleted": "已删除 {count} 条索引记录",
    "toast.settingsSaved": "设置已保存",
    "toast.backupDone": "数据库备份完成：{path}",
    "toast.healthOk": "体检通过",
    "toast.healthBad": "体检发现需要处理的问题",
    "toast.exported": "已导出：{path}",
    "toast.exportedJson": "已导出可移植 JSON：{path}",
    "prompt.tags": "输入标签，多个标签用英文逗号分隔：",
    "confirm.delete": "确定删除 {count} 条索引记录？不会删除原始文件。",
    "health.good": "状态良好",
    "health.needsAttention": "需要关注",
  },
  "en-US": {
    "brand.title": "File Review",
    "nav.dashboard": "Dashboard",
    "nav.library": "Library",
    "nav.review": "Review",
    "nav.notes": "Notes",
    "nav.settings": "Settings",
    "actions.chooseLibrary": "Choose a local library",
    "actions.addLibrary": "Add Library",
    "actions.scanAll": "Scan all libraries",
    "actions.rescan": "Rescan",
    "actions.startDue": "Start next due item",
    "actions.startReview": "Start Review",
    "actions.enter": "Open",
    "actions.exportCsv": "Export CSV",
    "actions.openDefault": "Open with the default app",
    "actions.openWith": "Choose another app",
    "actions.openWithShort": "Other App",
    "actions.openFile": "Open File",
    "actions.openFolder": "Open containing folder",
    "actions.folder": "Folder",
    "actions.note": "Note",
    "actions.createLinkedNote": "Create a linked note",
    "actions.newNote": "New Note",
    "actions.newLocalNote": "Create as Local File",
    "actions.openNotesFolder": "Open Notes Folder",
    "actions.saveNote": "Save Note",
    "actions.next": "Next",
    "actions.save": "Save",
    "actions.health": "Check",
    "actions.exportJson": "Export JSON",
    "actions.exportProfile": "Export Profile",
    "actions.backupDb": "Back Up DB",
    "actions.scanPath": "Scan Path",
    "actions.chooseFolder": "Choose Folder",
    "actions.moveProfile": "Move Here",
    "actions.importProfile": "Import Profile",
    "actions.choosePackage": "Choose Package",
    "actions.openProfileFolder": "Open Data Folder",
    "actions.refresh": "Refresh",
    "actions.close": "Close",
    "actions.previous": "Back",
    "actions.nextStep": "Next",
    "actions.done": "Done",
    "actions.chooseLibraryNow": "Choose Library Now",
    "search.placeholder": "Search files, paths, tags",
    "metrics.dueToday": "Due Today",
    "metrics.waiting": "Waiting",
    "metrics.total": "All Items",
    "metrics.localIndex": "Local index",
    "metrics.reviewedToday": "Reviewed Today",
    "metrics.streak": "Streak",
    "metrics.studyTrace": "Study trace",
    "dashboard.title": "Dashboard",
    "dashboard.subtitle": "Today's review queue and library status",
    "dashboard.queue": "Review Queue",
    "dashboard.futureDue": "Future Due",
    "library.title": "Library",
    "library.subtitle": "Browse local files like Obsidian and add them to review in batches",
    "library.localLibraries": "Local Libraries",
    "library.manualPath": "Manual folder path",
    "library.manualPathPlaceholder": "Example: C:\\Users\\Name\\Documents\\Library",
    "review.title": "Review",
    "review.subtitle": "Read, rate, and schedule the next review",
    "review.waiting": "Ready",
    "review.chooseOne": "Choose an item to begin",
    "review.previewTitle": "Review Area",
    "review.previewHint": "Previewable files and file details appear here after you start.",
    "review.ratingTitle": "Rate This Review",
    "review.history": "Review History",
    "notes.title": "Notes",
    "notes.subtitle": "Write review notes as real Markdown files",
    "notes.titlePlaceholder": "Note title",
    "notes.editorPlaceholder": "Write review notes here...",
    "notes.empty": "No notes yet. Create one here, or create a linked note while reviewing.",
    "settings.title": "Settings",
    "settings.subtitle": "Personalization, scheduling, and local data paths",
    "settings.personalization": "Personalization",
    "settings.algorithm": "Algorithm",
    "settings.fixed": "Fixed interval",
    "settings.retention": "Target retention",
    "settings.maxReviews": "Daily review limit",
    "settings.reminderTime": "Reminder time",
    "settings.reminderEnabled": "Reminder",
    "settings.autoOpen": "Open externally when review starts",
    "settings.notesDir": "Notes folder",
    "settings.localNoteOpen": "Open containing folder after local note creation",
    "settings.theme": "Theme",
    "settings.accent": "Accent",
    "settings.language": "Language",
    "settings.customCss": "Custom CSS",
    "settings.paths": "Data Paths",
    "settings.profileDir": "Main data folder",
    "settings.importProfile": "Profile package path",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.paper": "Paper",
    "paths.config": "Config file",
    "paths.database": "Database",
    "paths.appDir": "App data folder",
    "paths.log": "Log",
    "paths.plugins": "Plugins folder",
    "paths.notes": "Notes folder",
    "paths.pointer": "Location pointer",
    "help.title": "Help",
    "help.body": "Reviews now stay inside the app by default and do not launch the system default app automatically. If a file cannot be previewed, use Default Open or Other App. Notes are real Markdown files, editable inside the app or with any local editor.",
    "plugins.title": "Plugin Development",
    "plugins.empty": "No plugins yet. Future plugin folders can live here.",
    "health.title": "Long-term Health Check",
    "health.hint": "Check the database, config, app resources, and original file visibility.",
    "filters.all": "All",
    "filters.due": "Due",
    "filters.new": "New",
    "filters.future": "Future",
    "filters.status": "Status filter",
    "status.active": "Active",
    "status.suspended": "Suspended",
    "status.done": "Done",
    "status.all": "All statuses",
    "batch.tag": "Batch tags",
    "batch.tagShort": "Tags",
    "batch.suspend": "Suspend selected",
    "batch.suspendShort": "Suspend",
    "batch.activate": "Reactivate selected",
    "batch.activateShort": "Reactivate",
    "batch.dueToday": "Make due today",
    "batch.todayShort": "Today",
    "batch.done": "Mark done",
    "batch.doneShort": "Done",
    "batch.delete": "Delete index records",
    "batch.deleteShort": "Delete",
    "table.file": "File",
    "table.due": "Due",
    "table.retention": "Retention",
    "table.count": "Reviews",
    "table.time": "Time",
    "table.actions": "Actions",
    "ratings.again": "Again",
    "ratings.againHint": "Review soon",
    "ratings.hard": "Hard",
    "ratings.hardHint": "Shorter interval",
    "ratings.good": "Good",
    "ratings.goodHint": "Normal progress",
    "ratings.easy": "Easy",
    "ratings.easyHint": "Longer interval",
    "onboarding.step1Title": "Welcome to File Review",
    "onboarding.step1Body": "It never moves your files. It indexes local files and reminds you to review them with a memory schedule.",
    "onboarding.step2Title": "Choose a local library",
    "onboarding.step2Body": "Start with a folder of PDFs, notes, images, or videos. After scanning, you can browse, search, and batch manage everything.",
    "onboarding.step3Title": "Use Start Review each day",
    "onboarding.step3Body": "After reading, rate the item as Again, Hard, Good, or Easy. The app schedules the next review automatically.",
    "onboarding.stepAddFileTitle": "Or add a single file",
    "onboarding.stepAddFileBody": "You don't need a library first. Add one PDF, document, image, or video directly.",
    "onboarding.stepSettingsTitle": "Personalize in Settings",
    "onboarding.stepSettingsBody": "Tune the review algorithm, target retention, daily limit, reminder time, theme, and accent color.",
    "onboarding.stepHelpTitle": "Reopen this tour anytime from Help",
    "onboarding.stepHelpBody": "Open “Help” on the left to reread the quick start and restart the new-user tour.",
    "actions.skipTour": "Skip tour",
    "actions.restartTour": "Restart tour",
    "actions.finish": "Finish",
    "help.restartTour": "Start new-user tour",
    "empty.noDueTitle": "Nothing due today",
    "empty.noDueBody": "Add items from your library, or enjoy a clear queue.",
    "empty.noFuture": "No future due data yet.",
    "empty.noLibraryTitle": "No library yet",
    "empty.noLibraryBody": "Click Add Library and choose a folder that already contains your learning files.",
    "empty.noTree": "No visible content in this folder.",
    "empty.noItemsTitle": "No matching files",
    "empty.noItemsBody": "Adjust filters or scan a local library.",
    "empty.fileMissing": "File not found",
    "empty.noHistory": "No history yet.",
    "labels.noTags": "No tags",
    "labels.fileMissing": "Missing file",
    "labels.folder": "Folder",
    "labels.unscanned": "Not scanned",
    "labels.files": "files",
    "labels.reviewButton": "Review",
    "labels.reviewRound": "Review #{count}",
    "labels.intervalDays": "{days} days interval",
    "labels.report": "Report: {path}",
    "time.unscheduled": "Unscheduled",
    "time.today": "Today {time}",
    "time.tomorrow": "Tomorrow {time}",
    "time.yesterday": "Yesterday {time}",
    "toast.openingFolderPicker": "Opening folder picker...",
    "toast.cancelled": "Cancelled. You can also paste a folder path and scan it.",
    "toast.pathRequired": "Enter a valid path first",
    "toast.profileMoved": "Main data folder moved: {path}",
    "toast.profileImported": "Profile imported. Backup before import: {path}",
    "toast.profileExported": "Profile package exported: {path}",
    "toast.packageSelected": "Profile package selected",
    "toast.noteCreated": "Note created",
    "toast.noteSaved": "Note saved",
    "toast.noNoteSelected": "Select or create a note first",
    "toast.scanDone": "Scan complete: {added} added, {updated} updated",
    "toast.scanAll": "Scanning all libraries...",
    "toast.scanAllDone": "Scan complete, processed {count} records; {missing} missing libraries skipped",
    "toast.libraryDeleted": "Library removed. {count} index records deleted; source files untouched.",
    "toast.noDue": "No due items right now",
    "toast.startFirst": "Start a review first",
    "toast.reviewSaved": "Saved. Next review: {date}",
    "toast.selectFirst": "Select files first",
    "toast.tagUpdated": "Updated tags for {count} files",
    "toast.suspended": "Suspended {count} files",
    "toast.statusChanged": "{label} {count} files",
    "toast.dueToday": "Made {count} files due today",
    "toast.deleted": "Deleted {count} index records",
    "toast.settingsSaved": "Settings saved",
    "toast.backupDone": "Database backup complete: {path}",
    "toast.healthOk": "Health check passed",
    "toast.healthBad": "Health check found issues",
    "toast.exported": "Exported: {path}",
    "toast.exportedJson": "Portable JSON exported: {path}",
    "prompt.tags": "Enter tags, separated by commas:",
    "confirm.delete": "Delete {count} index records? Original files will not be deleted.",
    "confirm.deleteLibrary": "Remove library \"{name}\" from the app? {count} index records will be deleted, but original files will not be touched.",
    "health.good": "Healthy",
    "health.needsAttention": "Needs attention",
  },
};

I18N["zh-CN"] = {
  "brand.title": "文件复习",
  "nav.dashboard": "总览",
  "nav.library": "文件库",
  "nav.review": "复习",
  "nav.notes": "笔记",
  "nav.settings": "设置",
  "nav.help": "帮助",
  "actions.chooseLibrary": "选择本地文件库",
  "actions.addLibrary": "添加文件库",
  "actions.scanAll": "扫描全部文件库",
  "actions.rescan": "重新扫描",
  "actions.startDue": "开始下一项复习",
  "actions.startReview": "开始复习",
  "actions.enter": "进入",
  "actions.exportCsv": "导出 CSV",
  "actions.openDefault": "用系统默认程序打开",
  "actions.openWith": "选择其他应用打开",
  "actions.openWithShort": "其他应用",
  "actions.openFile": "打开文件",
  "actions.openFolder": "打开所在文件夹",
  "actions.folder": "所在文件夹",
  "actions.note": "笔记",
  "actions.createLinkedNote": "为当前资料新建笔记",
  "actions.newNote": "新建笔记",
  "actions.newLocalNote": "本地方式新建",
  "actions.openNotesFolder": "打开笔记目录",
  "actions.saveNote": "保存笔记",
  "actions.next": "下一项",
  "actions.save": "保存",
  "actions.health": "体检",
  "actions.exportJson": "导出 JSON",
  "actions.exportProfile": "导出迁移包",
  "actions.backupDb": "备份数据库",
  "actions.scanPath": "扫描路径",
  "actions.chooseFolder": "选择文件夹",
  "actions.chooseExportDir": "选择导出目录",
  "actions.openExportFolder": "打开导出目录",
  "actions.moveProfile": "迁移到此目录",
  "actions.importProfile": "导入迁移包",
  "actions.choosePackage": "选择迁移包",
  "actions.openProfileFolder": "打开数据目录",
  "actions.refresh": "刷新",
  "actions.close": "关闭",
  "actions.previous": "上一步",
  "actions.nextStep": "下一步",
  "actions.done": "完成",
  "actions.chooseLibraryNow": "现在选择文件库",
  "search.placeholder": "搜索文件、路径、标签",
  "metrics.dueToday": "今日到期",
  "metrics.waiting": "等待复习",
  "metrics.total": "全部资料",
  "metrics.localIndex": "本地索引",
  "metrics.reviewedToday": "今日已复习",
  "metrics.streak": "连续天数",
  "metrics.studyTrace": "学习轨迹",
  "dashboard.title": "总览",
  "dashboard.subtitle": "今日复习队列与文件库状态",
  "dashboard.queue": "复习队列",
  "dashboard.futureDue": "未来到期",
  "library.title": "文件库",
  "library.subtitle": "像 Obsidian 一样浏览本地资料，并批量加入复习系统",
  "library.localLibraries": "本地文件库",
  "library.manualPath": "手动添加文件夹路径",
  "library.manualPathPlaceholder": "例如 C:\\Users\\你的名字\\Documents\\资料库",
  "review.title": "复习",
  "review.subtitle": "按记忆曲线完成阅读、评价和下次提醒",
  "review.waiting": "等待开始",
  "review.chooseOne": "请选择一项资料开始复习",
  "review.previewTitle": "复习区",
  "review.previewHint": "打开资料后，这里会显示可预览文件或文件信息。",
  "review.ratingTitle": "完成评价",
  "review.history": "复习历史",
  "notes.title": "笔记",
  "notes.subtitle": "记录复习笔记，保存为真实 Markdown 文件",
  "notes.titlePlaceholder": "笔记标题",
  "notes.editorPlaceholder": "在这里记录复习笔记...",
  "notes.empty": "还没有笔记。可以新建一篇，或在复习时为当前资料建立关联笔记。",
  "notes.selectAll": "全选",
  "notes.clearSelection": "取消选择",
  "notes.exportSelected": "导出所选",
  "notes.deleteSelected": "删除所选",
  "notes.deleteCurrent": "删除当前",
  "notes.selectionEmpty": "未选择笔记",
  "notes.selectionCount": "已选择 {count} 篇笔记",
  "settings.title": "设置",
  "settings.subtitle": "个性化界面、调度算法与本地配置路径",
  "settings.personalization": "个性化",
  "settings.algorithm": "算法",
  "settings.fixed": "固定间隔",
  "settings.retention": "目标记忆率",
  "settings.maxReviews": "每日复习上限",
  "settings.reminderTime": "提醒时间",
  "settings.reminderEnabled": "提醒开关",
  "settings.autoOpen": "复习开始时外部打开文件",
  "settings.notesDir": "笔记存储目录",
  "settings.exportDir": "默认导出目录",
  "settings.localNoteOpen": "本地方式新建后打开所在文件夹",
  "settings.theme": "主题",
  "settings.accent": "强调色",
  "settings.language": "语言",
  "settings.customCss": "自定义 CSS",
  "settings.paths": "配置位置",
  "settings.profileDir": "主数据目录",
  "settings.importProfile": "导入迁移包路径",
  "theme.light": "明亮",
  "theme.dark": "深色",
  "theme.paper": "纸面",
  "paths.config": "配置文件",
  "paths.database": "数据库",
  "paths.appDir": "程序数据目录",
  "paths.log": "日志",
  "paths.plugins": "插件目录",
  "paths.notes": "笔记目录",
  "paths.exports": "导出目录",
  "paths.pointer": "位置指针",
  "help.title": "帮助说明",
  "help.body": "完整教程已经放在左侧“帮助”页。这里保存的是个性化配置：复习算法、提醒、主题、笔记目录、导出目录和自定义 CSS。",
  "help.startTitle": "快速入门",
  "help.subtitle": "从选择文件库到迁移备份，一页看清软件怎么用",
  "help.libraryTitle": "文件库",
  "help.libraryBody": "点击“添加文件库”选择已有资料文件夹，或把路径粘贴到文件库页手动扫描。软件只建立索引，不移动原始文件。",
  "help.reviewTitle": "复习",
  "help.reviewBody": "每天点击“开始复习”。读完资料后选择忘记、困难、良好或简单，系统会自动安排下一次复习。",
  "help.openTitle": "打开方式",
  "help.openBody": "复习开始默认只在软件内预览，不会弹出系统默认软件。无法预览时再点“默认打开”或“其他应用”。",
  "help.notesTitle": "笔记",
  "help.notesBody": "笔记是真实 Markdown 文件。可以在软件里新建、编辑、保存，也可以用“本地方式新建”让资源管理器接管。",
  "help.notesManageTitle": "笔记管理",
  "help.notesManageBody": "在笔记列表勾选多篇笔记后，可以批量导出到默认导出目录，或确认后删除笔记文件和数据库记录。",
  "help.exportTitle": "导出与迁移",
  "help.exportBody": "在设置页先选择默认导出目录，再导出 CSV、JSON、数据库备份或完整迁移包。迁移包包含配置、数据库备份、插件和笔记。",
  "help.pathsTitle": "配置路径",
  "help.pathsBody": "设置页会显示配置文件、数据库、日志、插件、笔记、导出目录的完整路径。主数据目录可一键迁移。",
  "help.pluginsTitle": "插件与未来升级",
  "help.pluginsBody": "插件目录已预留，默认只读取清单不执行插件代码。长期稳定依靠 SQLite、JSON、迁移包和体检流程。",
  "help.safetyTitle": "安全边界",
  "help.safetyBody": "删除文件库索引不会删除原始资料。删除笔记会删除你创建的笔记文件，软件会先弹出确认。",
  "plugins.title": "插件开发预留",
  "plugins.empty": "暂无插件。以后把插件文件夹放在这里即可。",
  "health.title": "长期稳定性体检",
  "health.hint": "点击体检，检查数据库、配置、资源文件和原始文件可见性。",
  "filters.all": "全部",
  "filters.due": "到期",
  "filters.new": "新资料",
  "filters.future": "未到期",
  "filters.status": "状态筛选",
  "status.active": "活动",
  "status.suspended": "暂停",
  "status.done": "完成",
  "status.all": "全部状态",
  "batch.tag": "批量标签",
  "batch.tagShort": "标签",
  "batch.suspend": "暂停所选",
  "batch.suspendShort": "暂停",
  "batch.activate": "恢复为活动",
  "batch.activateShort": "恢复",
  "batch.dueToday": "设为今天复习",
  "batch.todayShort": "今天",
  "batch.done": "标记完成",
  "batch.doneShort": "完成",
  "batch.delete": "删除索引记录",
  "batch.deleteShort": "删除",
  "table.file": "文件",
  "table.due": "到期",
  "table.retention": "记忆率",
  "table.count": "次数",
  "table.time": "时长",
  "table.actions": "操作",
  "ratings.again": "忘记",
  "ratings.againHint": "很快再看",
  "ratings.hard": "困难",
  "ratings.hardHint": "缩短间隔",
  "ratings.good": "良好",
  "ratings.goodHint": "正常推进",
  "ratings.easy": "简单",
  "ratings.easyHint": "拉长间隔",
  "onboarding.step1Title": "欢迎使用智能文件复习系统",
  "onboarding.step1Body": "它不会移动你的资料，只会索引本地文件，并按记忆曲线提醒你复习。",
  "onboarding.step2Title": "选择一个本地文件库",
  "onboarding.step2Body": "从你的 PDF、笔记、图片、视频文件夹开始。扫描后就能浏览、搜索和批量管理。",
  "onboarding.step3Title": "每天从“开始复习”进入",
  "onboarding.step3Body": "阅读资料后选择忘记、困难、良好或简单，系统会自动安排下一次复习。",
  "empty.noDueTitle": "今天没有到期资料",
  "empty.noDueBody": "可以浏览文件库添加新资料，或安心收工。",
  "empty.noFuture": "暂无未来到期数据。",
  "empty.noLibraryTitle": "还没有文件库",
  "empty.noLibraryBody": "点击添加文件库，选择你已有的资料文件夹。",
  "empty.noTree": "这个文件夹里没有可显示内容。",
  "empty.noItemsTitle": "没有匹配文件",
  "empty.noItemsBody": "调整筛选条件，或扫描一个本地文件库。",
  "empty.fileMissing": "文件不存在",
  "empty.noHistory": "暂无历史记录。",
  "labels.noTags": "无标签",
  "labels.fileMissing": "文件缺失",
  "labels.folder": "文件夹",
  "labels.unscanned": "未扫描",
  "labels.files": "个文件",
  "labels.reviewButton": "复习",
  "labels.reviewRound": "第 {count} 次",
  "labels.intervalDays": "间隔 {days} 天",
  "labels.report": "报告：{path}",
  "time.unscheduled": "未安排",
  "time.today": "今天 {time}",
  "time.tomorrow": "明天 {time}",
  "time.yesterday": "昨天 {time}",
  "toast.openingFolderPicker": "正在打开文件夹选择窗口...",
  "toast.cancelled": "已取消选择；你也可以直接粘贴文件夹路径后扫描。",
  "toast.pathRequired": "请先输入一个有效路径",
  "toast.profileMoved": "主数据目录已迁移：{path}",
  "toast.profileImported": "迁移包已导入，导入前备份：{path}",
  "toast.profileExported": "迁移包已导出：{path}",
  "toast.packageSelected": "已选择迁移包",
  "toast.exportDirSelected": "已选择导出目录：{path}",
  "toast.noteCreated": "笔记已创建",
  "toast.noteSaved": "笔记已保存",
  "toast.noNoteSelected": "请先选择或新建一篇笔记",
  "toast.notesExported": "已导出 {count} 篇笔记到：{path}",
  "toast.notesDeleted": "已删除 {count} 篇笔记",
  "toast.movingProfile": "正在迁移主数据目录...",
  "toast.actionFailed": "操作失败：{message}",
  "toast.scanDone": "扫描完成：新增 {added}，更新 {updated}",
  "toast.scanAll": "正在扫描全部文件库...",
  "toast.scanAllDone": "扫描完成，处理 {count} 条记录",
  "toast.noDue": "当前没有到期资料",
  "toast.startFirst": "请先开始一项复习",
  "toast.reviewSaved": "已记录，下一次：{date}",
  "toast.selectFirst": "请先勾选文件",
  "toast.selectNotesFirst": "请先勾选笔记",
  "toast.tagUpdated": "已更新 {count} 个文件的标签",
  "toast.suspended": "已暂停 {count} 个文件",
  "toast.statusChanged": "已{label} {count} 个文件",
  "toast.dueToday": "已设为今天复习：{count} 个文件",
  "toast.deleted": "已删除 {count} 条索引记录",
  "toast.settingsSaved": "设置已保存",
  "toast.backupDone": "数据库备份完成：{path}",
  "toast.healthOk": "体检通过",
  "toast.healthBad": "体检发现需要处理的问题",
  "toast.exported": "已导出：{path}",
  "toast.exportedJson": "已导出可移植 JSON：{path}",
  "prompt.tags": "输入标签，多个标签用英文逗号分隔：",
  "confirm.delete": "确定删除 {count} 条索引记录？不会删除原始文件。",
  "confirm.deleteNotes": "确定删除 {count} 篇笔记？这会删除笔记文件和数据库记录。",
  "health.good": "状态良好",
  "health.needsAttention": "需要关注",
};

Object.assign(I18N["en-US"], {
  "actions.chooseFile": "Choose single file",
  "actions.addFile": "Add File",
  "actions.newDeck": "New Deck",
  "actions.share": "Share",
  "achievements.title": "Achievements",
  "achievements.progress": "{unlocked}/{total} unlocked",
  "achievements.level": "Lv.{level} {title} · {points} XP",
  "decks.title": "Review Decks",
  "decks.filter": "Deck filter",
  "decks.all": "All decks",
  "batch.deck": "Assign deck",
  "batch.deckShort": "Deck",
  "table.deck": "Deck",
  "empty.noLibraryBody": "Add a library folder, or add a single file directly.",
  "help.singleFileTitle": "Single Files",
  "help.singleFileBody": "Add an individual PDF, document, image, or video directly without scanning a folder first.",
  "help.decksTitle": "Decks and Tags",
  "help.decksBody": "Create Anki-like review decks, batch assign files into categories, and use tags for finer organization.",
  "help.shareTitle": "Share Packages",
  "help.shareBody": "Export selected files or a deck as a share package. It includes indexes, decks, tags, and notes by default, and can optionally include source files.",
  "help.exportBody": "Every export and backup asks where to save first. You can still set a default export folder to make the dialog start in your preferred location.",
  "help.pluginsBody": "Use Plugin Manager to import ZIP packages or plugin folders, open the plugins folder, and enable or disable modules. Achievement packs are JSON manifests by default.",
  "plugins.title": "Plugin Manager",
  "plugins.enabled": "Enabled",
  "plugins.disabled": "Disabled",
  "plugins.enabledToast": "Plugin enabled",
  "plugins.disabledToast": "Plugin disabled",
  "plugins.importZip": "Import ZIP",
  "plugins.importFolder": "Import Folder",
  "plugins.openFolder": "Open Folder",
  "plugins.imported": "Plugin imported: {name}",
  "social.title": "Social Profile",
  "social.displayName": "Display name",
  "social.handle": "Handle",
  "social.website": "Website",
  "social.contact": "Contact",
  "social.bio": "Bio",
  "social.shareStats": "Share study stats",
  "social.shareAchievements": "Share achievement level",
  "social.friendDiscovery": "Allow future friend discovery",
  "social.copyCard": "Copy Social Card JSON",
  "social.enabledHint": "Social plugin is enabled. This is local profile data for future sharing features.",
  "social.saved": "Social profile saved",
  "social.cardCopied": "Social card copied",
  "social.copyFallback": "Copy this social card JSON:",
  "toast.fileAdded": "File added: {name}",
  "toast.deckCreated": "Deck created: {name}",
  "toast.deckUpdated": "Deck updated",
  "toast.deckDeleted": "Deck deleted; items moved to the default deck",
  "toast.deckAssigned": "Assigned {count} files to deck",
  "toast.shareExported": "Share package exported: {path}",
  "toast.openingSavePicker": "Choose where to save...",
  "dialog.exportCsv": "Save CSV export",
  "dialog.exportJson": "Save portable JSON",
  "dialog.exportProfile": "Save migration package",
  "dialog.backupBeforeImport": "Save backup before importing",
  "dialog.backupDb": "Save database backup",
  "dialog.exportShare": "Save share package",
  "prompt.deckName": "Deck name:",
  "prompt.deckDescription": "Deck description:",
  "prompt.chooseDeck": "Enter a deck number:",
  "confirm.deleteDeck": "Delete deck \"{name}\"? Its files will move to the default deck.",
  "confirm.includeFiles": "Include original source files in the share package? Choose Cancel to export metadata and notes only.",
  "nav.help": "Help",
  "actions.chooseExportDir": "Choose Export Folder",
  "actions.openExportFolder": "Open Export Folder",
  "notes.selectAll": "Select All",
  "notes.clearSelection": "Clear",
  "notes.exportSelected": "Export Selected",
  "notes.deleteSelected": "Delete Selected",
  "notes.deleteCurrent": "Delete Current",
  "notes.selectionEmpty": "No notes selected",
  "notes.selectionCount": "{count} notes selected",
  "settings.exportDir": "Default export folder",
  "paths.exports": "Exports folder",
  "help.body": "The full tutorial is now on the Help page. This page stores personalization: scheduling, reminders, theme, notes folder, export folder, and custom CSS.",
  "help.startTitle": "Quick Start",
  "help.subtitle": "From choosing a library to backup and migration",
  "help.libraryTitle": "Library",
  "help.libraryBody": "Choose an existing folder or paste its path on the Library page. The app indexes files and does not move your originals.",
  "help.reviewTitle": "Review",
  "help.reviewBody": "Use Start Review each day. After reading, rate Again, Hard, Good, or Easy so the next review is scheduled.",
  "help.openTitle": "Opening Files",
  "help.openBody": "Reviews stay inside the app by default. If a format cannot be previewed, use Default Open or Other App.",
  "help.notesTitle": "Notes",
  "help.notesBody": "Notes are real Markdown files. Create, edit, and save them in the app, or use local file workflows.",
  "help.notesManageTitle": "Note Management",
  "help.notesManageBody": "Select notes in the list to export them to the default export folder or delete note files and database records after confirmation.",
  "help.exportTitle": "Export and Migration",
  "help.exportBody": "Choose a default export folder first, then export CSV, JSON, database backups, or a full profile package with config, backups, plugins, and notes.",
  "help.pathsTitle": "Data Paths",
  "help.pathsBody": "Settings shows config, database, log, plugins, notes, and export folders. The main data folder can be moved in one step.",
  "help.pluginsTitle": "Plugins and Future Upgrades",
  "help.pluginsBody": "The plugins folder is reserved. The app reads manifests only by default. Long-term stability depends on SQLite, JSON, profile packages, and health checks.",
  "help.safetyTitle": "Safety",
  "help.safetyBody": "Deleting library index records never deletes source files. Deleting notes deletes note files after confirmation.",
  "toast.exportDirSelected": "Export folder selected: {path}",
  "toast.notesExported": "Exported {count} notes to: {path}",
  "toast.notesDeleted": "Deleted {count} notes",
  "toast.movingProfile": "Moving main data folder...",
  "toast.actionFailed": "Action failed: {message}",
  "toast.selectNotesFirst": "Select notes first",
  "confirm.deleteNotes": "Delete {count} notes? This removes note files and database records.",
});

Object.assign(I18N["zh-CN"], {
  "actions.chooseFile": "选择单个文件",
  "actions.addFile": "添加文件",
  "actions.newDeck": "新建卡组",
  "actions.share": "分享",
  "achievements.title": "成就",
  "achievements.progress": "已解锁 {unlocked}/{total}",
  "achievements.level": "Lv.{level} {title} · {points} XP",
  "decks.title": "复习卡组",
  "decks.filter": "卡组筛选",
  "decks.all": "全部卡组",
  "batch.deck": "分配卡组",
  "batch.deckShort": "卡组",
  "table.deck": "卡组",
  "empty.noLibraryBody": "可以添加文件夹作为文件库，也可以直接添加单个文件。",
  "help.singleFileTitle": "单独文件",
  "help.singleFileBody": "可以直接添加某一个 PDF、文档、图片或视频，不必先扫描文件夹。",
  "help.decksTitle": "卡组与标签",
  "help.decksBody": "像 Anki 一样创建复习卡组，批量把资料放进分类，再用标签继续细分。",
  "help.shareTitle": "分享包",
  "help.shareBody": "勾选资料或选择卡组后可导出分享包，默认包含索引、卡组、标签和笔记，也可选择包含原始文件。",
  "help.exportBody": "所有导出和备份都会先让你选择保存位置。默认导出目录仍然保留，用来让保存窗口优先打开到你喜欢的位置。",
  "help.pluginsBody": "插件管理支持导入 ZIP 插件包、导入插件文件夹、打开插件目录，并可启用或关闭模块。成就包默认使用 JSON 清单扩展，稳定优先。",
  "plugins.title": "插件管理",
  "plugins.enabled": "已启用",
  "plugins.disabled": "已关闭",
  "plugins.enabledToast": "插件已启用",
  "plugins.disabledToast": "插件已关闭",
  "plugins.importZip": "导入插件包",
  "plugins.importFolder": "导入文件夹",
  "plugins.openFolder": "打开目录",
  "plugins.imported": "插件已导入：{name}",
  "social.title": "社交资料",
  "social.displayName": "显示名称",
  "social.handle": "账号 ID",
  "social.website": "主页",
  "social.contact": "联系信息",
  "social.bio": "简介",
  "social.shareStats": "分享学习统计",
  "social.shareAchievements": "分享成就等级",
  "social.friendDiscovery": "允许未来好友发现",
  "social.copyCard": "复制社交名片 JSON",
  "social.enabledHint": "社交插件已启用。当前只保存本地资料，为未来分享、好友和协作学习做准备。",
  "social.saved": "社交资料已保存",
  "social.cardCopied": "社交名片已复制",
  "social.copyFallback": "复制这段社交名片 JSON：",
  "toast.fileAdded": "已添加文件：{name}",
  "toast.deckCreated": "已创建卡组：{name}",
  "toast.deckUpdated": "卡组已更新",
  "toast.deckDeleted": "卡组已删除，资料已移到默认卡组",
  "toast.deckAssigned": "已将 {count} 个文件分配到卡组",
  "toast.shareExported": "分享包已导出：{path}",
  "toast.openingSavePicker": "正在选择保存位置...",
  "dialog.exportCsv": "保存 CSV 导出",
  "dialog.exportJson": "保存可迁移 JSON",
  "dialog.exportProfile": "保存迁移包",
  "dialog.backupBeforeImport": "保存导入前备份",
  "dialog.backupDb": "保存数据库备份",
  "dialog.exportShare": "保存分享包",
  "prompt.deckName": "卡组名称：",
  "prompt.deckDescription": "卡组说明：",
  "prompt.chooseDeck": "输入卡组编号：",
  "confirm.deleteDeck": "确定删除卡组“{name}”？其中资料会移到默认卡组。",
  "confirm.includeFiles": "是否把原始文件也放进分享包？点“取消”则只导出索引和笔记。",
});

Object.assign(I18N["zh-CN"], {
  "toast.libraryDeleted": "文件库已移除，删除 {count} 条索引记录；不会删除原始文件。",
  "toast.scanAllDone": "扫描完成，处理 {count} 条记录；跳过 {missing} 个失效文件库",
  "confirm.deleteLibrary": "要从软件里移除文件库“{name}”吗？会删除 {count} 条索引记录，但不会删除原始文件。",
});

for (const [key, values] of Object.entries(EXTRA_I18N)) {
  I18N["zh-CN"][key] = values["zh-CN"];
  I18N["en-US"][key] = values["en-US"];
}

// Guarantee ALL onboarding keys exist at runtime in BOTH languages. The
// zh-CN pack is fully reassigned above and only carries step1-3, so without
// this block the AddFile/Settings/Help steps fall back to raw English-looking
// keys — producing a mixed zh/en tour. Keeping the full set here in one place
// makes the tour language-consistent regardless of the reassignment mess.
Object.assign(I18N["zh-CN"], {
  "onboarding.step1Title": "欢迎使用智能文件复习系统",
  "onboarding.step1Body": "它不会移动你的资料，只会索引本地文件，并按记忆曲线提醒你复习。",
  "onboarding.step2Title": "选择一个本地文件库",
  "onboarding.step2Body": "从你的 PDF、笔记、图片、视频文件夹开始。扫描后就能浏览、搜索和批量管理。",
  "onboarding.stepAddFileTitle": "也可以添加单个文件",
  "onboarding.stepAddFileBody": "不必先建文件库，直接添加某一个 PDF、文档、图片或视频也行。",
  "onboarding.step3Title": "每天从“开始复习”进入",
  "onboarding.step3Body": "阅读资料后选择忘记、困难、良好或简单，系统会自动安排下一次复习。",
  "onboarding.stepSettingsTitle": "在设置里个性化",
  "onboarding.stepSettingsBody": "调整复习算法、目标记忆率、每日上限、提醒时间、语言、主题与强调色。",
  "onboarding.stepHelpTitle": "随时可在帮助里重开本引导",
  "onboarding.stepHelpBody": "点左侧“帮助”，随时重看快速入门，并重新开启新用户引导。",
  "actions.skipTour": "跳过引导",
  "actions.restartTour": "重新开始引导",
  "actions.finish": "完成",
  "help.restartTour": "开启新用户引导",
});
Object.assign(I18N["en-US"], {
  "onboarding.step1Title": "Welcome to File Review",
  "onboarding.step1Body": "It never moves your files. It indexes local files and reminds you to review them with a memory schedule.",
  "onboarding.step2Title": "Choose a local library",
  "onboarding.step2Body": "Start with a folder of PDFs, notes, images, or videos. After scanning, you can browse, search, and batch manage everything.",
  "onboarding.stepAddFileTitle": "Or add a single file",
  "onboarding.stepAddFileBody": "You don't need a library first. Add one PDF, document, image, or video directly.",
  "onboarding.step3Title": "Use Start Review each day",
  "onboarding.step3Body": "After reading, rate the item as Again, Hard, Good, or Easy. The app schedules the next review automatically.",
  "onboarding.stepSettingsTitle": "Personalize in Settings",
  "onboarding.stepSettingsBody": "Tune the review algorithm, target retention, daily limit, reminder time, language, theme, and accent color.",
  "onboarding.stepHelpTitle": "Reopen this tour anytime from Help",
  "onboarding.stepHelpBody": "Open “Help” on the left to reread the quick start and restart the new-user tour.",
  "actions.skipTour": "Skip tour",
  "actions.restartTour": "Restart tour",
  "actions.finish": "Finish",
  "help.restartTour": "Start new-user tour",
});

function t(key, vars = {}) {
  const pack = I18N[state.lang] || I18N["zh-CN"];
  const fallback = I18N["zh-CN"][key] || key;
  return String(pack[key] || fallback).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.body.dataset.lang = state.lang;
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  document.title = state.lang === "en-US" ? "File Review 2.14.0" : "智能文件复习系统 2.14.0";
  // If the tour is currently open, re-render its content so a mid-tour language
  // switch (the tour's Settings step exposes the language toggle) updates the
  // whole card, not just the buttons.
  const ob = $("#onboarding");
  if (ob && !ob.classList.contains("hidden")) {
    renderOnboardingStep();
  } else {
    updateOnboardingButtons();
  }
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function hms(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${pad(Math.floor(value / 3600))}:${pad(Math.floor((value % 3600) / 60))}:${pad(value % 60)}`;
}

function dayText(value) {
  if (!value) return t("time.unscheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target - start) / 86400000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (diff === 0) return t("time.today", { time });
  if (diff === 1) return t("time.tomorrow", { time });
  if (diff === -1) return t("time.yesterday", { time });
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const response = await fetch(path, init);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data.error || data || `Request failed: ${response.status}`);
  }
  return data;
}

function toast(message, isError = false) {
  const node = $("#toast");
  node.textContent = message;
  node.style.background = isError ? "#b91c1c" : "#111827";
  node.classList.add("show");
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove("show"), isError ? 6200 : 3200);
}

function reportError(error) {
  console.error(error);
  toast(t("toast.actionFailed", { message: error?.message || String(error) }), true);
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((node) => node.classList.remove("active"));
  const activeView = $(`#${view}View`);
  if (!activeView) return;
  activeView.classList.add("active");
  const titles = {
    dashboard: [t("dashboard.title"), t("dashboard.subtitle")],
    library: [t("library.title"), t("library.subtitle")],
    review: [t("review.title"), t("review.subtitle")],
    notes: [t("notes.title"), t("notes.subtitle")],
    settings: [t("settings.title"), t("settings.subtitle")],
    help: [t("help.title"), t("help.subtitle")],
  };
  $("#viewTitle").textContent = titles[view]?.[0] || "";
  $("#viewSubtitle").textContent = titles[view]?.[1] || "";
  if (view === "library") loadItems();
  if (view === "notes") loadNotes();
  if (view === "settings") renderSettings();
}

function applyTheme() {
  const config = state.config || {};
  const ui = config.ui || {};
  document.body.classList.toggle("dark", ui.theme === "dark");
  document.body.classList.toggle("paper", ui.theme === "paper");
  const css = `
    :root {
      --accent: ${ui.accent || "#2563eb"};
      --surface: ${ui.surface || "#ffffff"};
      --bg: ${ui.background || "#f4f6f8"};
      --text: ${ui.text || "#172033"};
      --sidebar: ${ui.sidebar || "#111827"};
    }
    ${ui.custom_css || ""}
  `;
  $("#runtimeTheme").textContent = css;
}

async function loadOverview() {
  state.overview = await api("/api/overview");
  state.config = state.overview.config;
  state.lang = localStorage.getItem("fileReviewerLanguage") || state.config?.ui?.language || "zh-CN";
  state.libraries = state.overview.libraries || [];
  state.decks = state.overview.decks || [];
  state.plugins = state.overview.plugins || [];
  state.social = state.overview.social || null;
  await loadCommonPaths();
  applyI18n();
  applyTheme();
  renderDashboard();
  renderLibraries();
  renderDecks();
  renderSettings();
  setupLibraryResizer();
}

async function loadCommonPaths() {
  try {
    const data = await api("/api/common-paths");
    state.commonPaths = data.paths || [];
  } catch {
    state.commonPaths = [];
  }
}

function renderDashboard() {
  const stats = state.overview?.stats || {};
  $("#metricDue").textContent = stats.due || 0;
  $("#metricTotal").textContent = stats.total || 0;
  $("#metricReviewedToday").textContent = stats.reviewed_today || 0;
  $("#metricSecondsToday").textContent = hms(stats.seconds_today || 0);
  $("#metricStreak").textContent = stats.streak || 0;

  const dueList = $("#dueList");
  const dueItems = state.overview?.due_items || [];
  dueList.innerHTML = dueItems.length
    ? dueItems.map((item) => `
      <div class="due-item">
        <div>
          <strong>${escapeHtml(item.file_name)}</strong>
          <span>${escapeHtml(item.tags || t("labels.noTags"))} · ${dayText(item.due_at)} · ${Math.round(item.retrievability * 100)}%</span>
        </div>
        <button class="primary-button" data-start-review="${item.id}">${t("labels.reviewButton")}</button>
      </div>
    `).join("")
    : `<div class="empty-state friendly-empty">
        <strong>${t("empty.noDueTitle")}</strong>
        <span>${t("empty.noDueBody")}</span>
        <button class="secondary-button" data-view-link="library">${t("actions.addLibrary")}</button>
      </div>`;

  const rows = state.overview?.future_due || [];
  const max = Math.max(1, ...rows.map((row) => row.count));
  $("#futureBars").innerHTML = rows.length
    ? rows.map((row) => `
      <div class="future-row">
        <span>${escapeHtml(row.day)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, row.count / max * 100)}%"></div></div>
        <strong>${row.count}</strong>
      </div>
    `).join("")
    : `<p class="muted">${t("empty.noFuture")}</p>`;

  renderAchievementPlugin();
  renderLearningStatsPlugin();
}

function renderLearningStatsPlugin() {
  const host = $("#dashboardPluginHost");
  if (!host) return;
  host.querySelectorAll("[data-plugin-module=\"learning_stats\"]").forEach((node) => node.remove());
  const stats = state.overview?.learning_stats || { enabled: false };
  if (!stats.enabled) return;
  const totals = stats.totals || {};
  const daily = stats.daily || [];
  const maxReviews = Math.max(1, ...daily.map((row) => row.reviews || 0));
  const maxSeconds = Math.max(1, ...daily.map((row) => row.seconds || 0));
  const panel = document.createElement("section");
  panel.className = "panel learning-stats-panel";
  panel.dataset.pluginModule = "learning_stats";
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h3>${t("learningStats.title")}</h3>
        <p class="muted">${t("learningStats.subtitle")}</p>
      </div>
    </div>
    <div class="learning-metrics">
      <div><strong>${totals.reviews || 0}</strong><span>${t("learningStats.reviews")}</span></div>
      <div><strong>${hms(totals.seconds || 0)}</strong><span>${t("learningStats.time")}</span></div>
      <div><strong>${totals.links || 0}</strong><span>${t("learningStats.links")}</span></div>
    </div>
    <div class="stats-chart">
      ${daily.map((row) => `
        <div class="stats-day" title="${escapeHtml(row.day)} · ${row.reviews || 0} · ${hms(row.seconds || 0)}">
          <span class="review-bar" style="height:${Math.max(5, (row.reviews || 0) / maxReviews * 100)}%"></span>
          <span class="time-bar" style="height:${Math.max(3, (row.seconds || 0) / maxSeconds * 100)}%"></span>
        </div>
      `).join("")}
    </div>
    <div class="deck-progress-list">
      ${(stats.decks || []).slice(0, 6).map((deck) => `
        <div class="deck-progress-row">
          <span class="deck-dot" style="background:${escapeHtml(deck.color || "#2563eb")}"></span>
          <strong>${escapeHtml(deck.name || "")}</strong>
          <span>${deck.reviews || 0} · ${hms(deck.seconds || 0)}</span>
        </div>
      `).join("")}
    </div>
  `;
  host.appendChild(panel);
}

function renderAchievementPlugin() {
  const layout = $("#dashboardLayout");
  const host = $("#dashboardPluginHost");
  if (!layout || !host) return;

  const achievement = state.overview?.achievements || { enabled: false, achievements: [], unlocked: 0, total: 0 };
  if (!achievement.enabled) {
    host.innerHTML = "";
    layout.classList.add("no-achievements");
    return;
  }

  layout.classList.remove("no-achievements");
  host.innerHTML = `
    <section class="panel achievements-panel" data-plugin-module="achievement_core">
      <div class="panel-head">
        <h3>${t("achievements.title")}</h3>
        <button class="text-button" data-view-link="library">${t("actions.share")}</button>
      </div>
      <div id="achievementSummary" class="achievement-summary"></div>
      <div id="achievementList" class="achievement-list"></div>
    </section>
  `;

  const percent = achievement.total ? Math.round((achievement.unlocked / achievement.total) * 100) : 0;
  const summary = $("#achievementSummary");
  const list = $("#achievementList");
  if (summary) {
    const reward = achievement.reward || {};
    summary.innerHTML = `
      <strong>${t("achievements.progress", { unlocked: achievement.unlocked || 0, total: achievement.total || 0 })}</strong>
      <span>${t("achievements.level", { level: reward.level || 1, title: reward.title || "", points: reward.points || 0 })}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, percent)}%"></div></div>
    `;
  }
  if (list) {
    list.innerHTML = (achievement.achievements || []).map((item) => `
      <div class="achievement-row ${item.unlocked ? "unlocked" : ""}">
        <span>${item.unlocked ? "✓" : Math.round((item.progress || 0) * 100) + "%"}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.description)}</small>
          <small>${escapeHtml(item.tier || "bronze")} · +${item.points || 0} XP · ${item.current || 0}/${item.target || 1}</small>
        </div>
      </div>
    `).join("");
  }
}

function renderLibraries() {
  const list = $("#libraryList");
  const libraries = state.libraries || [];
  if (state.activeLibraryId && !libraries.some((library) => library.id === state.activeLibraryId)) {
    state.activeLibraryId = null;
    state.treeRel = "";
  }
  if (!state.activeLibraryId && libraries.length) state.activeLibraryId = libraries[0].id;
  list.innerHTML = libraries.length
    ? libraries.map((library) => `
      <div class="library-item ${library.id === state.activeLibraryId ? "active" : ""}" data-library-id="${library.id}">
        <strong>${escapeHtml(library.display_name)}</strong>
        <small>${escapeHtml(library.root_path)}</small>
        <small>${library.file_count || 0} ${t("labels.files")} · ${library.last_scan_at ? dayText(library.last_scan_at) : t("labels.unscanned")}</small>
      </div>
    `).join("")
    : `<div class="empty-state friendly-empty">
        <strong>${t("empty.noLibraryTitle")}</strong>
        <span>${t("empty.noLibraryBody")}</span>
        <button class="primary-button" id="emptyAddLibraryBtn">${t("actions.addLibrary")}</button>
      </div>`;
  libraries.forEach((library) => {
    const node = list.querySelector(`[data-library-id="${library.id}"]`);
    if (!node) return;
    node.classList.toggle("missing", library.exists === false);
    if (!node.querySelector("[data-delete-library]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button library-delete";
      button.dataset.deleteLibrary = String(library.id);
      button.title = t("actions.delete");
      button.textContent = "×";
      node.appendChild(button);
    }
    if (library.exists === false) {
      node.setAttribute("title", t("labels.fileMissing"));
    } else {
      node.removeAttribute("title");
    }
  });
  renderCommonPaths();
  if (state.activeLibraryId) loadTree(state.activeLibraryId, state.treeRel);
  else {
    const tree = $("#treeList");
    if (tree) tree.innerHTML = "";
  }
}

function renderCommonPaths() {
  const target = $("#commonPathChips");
  if (!target) return;
  target.innerHTML = (state.commonPaths || []).map((item) => `
    <button type="button" class="chip" data-common-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      ${escapeHtml(item.label)}
    </button>
  `).join("");
}

function renderDecks() {
  const decks = state.decks || [];
  const list = $("#deckList");
  if (list) {
    list.innerHTML = decks.length
      ? decks.map((deck, index) => `
        <div class="deck-item ${String(deck.id) === String(state.filters.deckId || "") ? "active" : ""}" data-deck-id="${deck.id}" draggable="true" style="--deck-depth:${deck.depth || 0}">
          <button class="deck-drag-handle icon-button" data-deck-drag="${deck.id}" title="Drag">↕</button>
          <span class="deck-dot" style="background:${escapeHtml(deck.color || "#2563eb")}"></span>
          <div>
            <strong>${index + 1}. ${escapeHtml(deck.name)}</strong>
            <small>${deck.item_count || 0} ${t("labels.files")} · ${deck.due_count || 0} ${t("filters.due")}</small>
          </div>
          ${deck.is_default ? "" : `<button class="icon-button deck-delete" data-delete-deck="${deck.id}" title="Delete">×</button>`}
        </div>
      `).join("")
      : `<p class="muted">${t("decks.all")}</p>`;
  }
  const select = $("#deckFilter");
  if (select) {
    const current = state.filters.deckId || "";
    select.innerHTML = `<option value="">${t("decks.all")}</option>` + decks.map((deck) => (
      `<option value="${deck.id}">${escapeHtml(`${"  ".repeat(deck.depth || 0)}${deck.full_name || deck.name}`)}</option>`
    )).join("");
    select.value = current;
  }
  enhanceDeckRows();
  bindDeckDrag();
}

function enhanceDeckRows() {
  const list = $("#deckList");
  if (!list) return;
  list.querySelectorAll(".deck-item[data-deck-id]").forEach((row) => {
    const deckId = row.dataset.deckId;
    row.style.paddingLeft = `calc(10px + ${(Number(row.style.getPropertyValue("--deck-depth")) || 0) * 18}px)`;
    if (!row.querySelector("[data-subdeck]")) {
      const actions = document.createElement("div");
      actions.className = "deck-actions";
      actions.innerHTML = `
        <button class="icon-button" data-subdeck="${deckId}" title="${t("actions.subDeck")}">+</button>
        <button class="icon-button" data-rename-deck="${deckId}" title="${t("actions.renameDeck")}">E</button>
      `;
      row.appendChild(actions);
    }
  });
}

function renderDecks() {
  const decks = state.decks || [];
  const list = $("#deckList");
  if (list) {
    list.innerHTML = decks.length
      ? decks.map((deck, index) => `
        <div class="deck-item ${String(deck.id) === String(state.filters.deckId || "") ? "active" : ""}" data-deck-id="${deck.id}" draggable="true" style="--deck-depth:${deck.depth || 0}">
          <button class="deck-drag-handle icon-button" data-deck-drag="${deck.id}" title="Drag">D</button>
          <span class="deck-dot" style="background:${escapeHtml(deck.color || "#2563eb")}"></span>
          <div class="deck-main">
            <strong>${index + 1}. ${escapeHtml(deck.name)}</strong>
            <small>${deck.item_count || 0} ${t("labels.files")} · ${deck.due_count || 0} ${t("filters.due")}</small>
          </div>
          <div class="deck-actions">
            <button class="icon-button" data-subdeck="${deck.id}" title="${t("actions.subDeck")}">+</button>
            <button class="icon-button" data-rename-deck="${deck.id}" title="${t("actions.renameDeck")}">E</button>
            ${deck.is_default ? "" : `<button class="icon-button deck-delete" data-delete-deck="${deck.id}" title="Delete">x</button>`}
          </div>
        </div>
      `).join("")
      : `<p class="muted">${t("decks.all")}</p>`;
  }
  const select = $("#deckFilter");
  if (select) {
    const current = state.filters.deckId || "";
    select.innerHTML = `<option value="">${t("decks.all")}</option>` + decks.map((deck) => (
      `<option value="${deck.id}">${escapeHtml(`${"  ".repeat(deck.depth || 0)}${deck.full_name || deck.name}`)}</option>`
    )).join("");
    select.value = current;
  }
  bindDeckDrag();
}

function deckName(deckId) {
  const deck = (state.decks || []).find((item) => String(item.id) === String(deckId));
  return deck ? deck.name : t("decks.all");
}

async function loadTree(libraryId, rel = "") {
  try {
    const data = await api(`/api/tree?library_id=${libraryId}&rel=${encodeURIComponent(rel)}`);
    state.treeRel = data.rel || "";
    const parentRel = state.treeRel.split(/[\\/]/).slice(0, -1).join("/");
    const rows = [];
    if (state.treeRel) {
      rows.push(`<div class="tree-row dir" data-tree-rel="${escapeHtml(parentRel)}"><strong>..</strong><span></span></div>`);
    }
    rows.push(...data.children.map((node) => `
      <div class="tree-row ${node.is_dir ? "dir" : ""}" data-tree-rel="${escapeHtml(node.rel)}" data-indexed-id="${node.indexed_id || ""}" data-is-dir="${node.is_dir}">
        <strong>${escapeHtml(node.name)}</strong>
        <span>${node.is_dir ? t("labels.folder") : `${escapeHtml(node.ext || "")} · ${escapeHtml(node.size)}`}</span>
      </div>
    `));
    $("#treeList").innerHTML = rows.join("") || `<p class="muted">${t("empty.noTree")}</p>`;
  } catch (error) {
    $("#treeList").innerHTML = `<p class="danger">${escapeHtml(error.message)}</p>`;
  }
}

async function loadItems() {
  const params = new URLSearchParams({
    search: state.filters.search,
    status: state.filters.status,
    due: state.filters.due,
    sort: state.filters.sort,
    direction: state.filters.direction,
    page_size: "150",
  });
  if (state.filters.deckId) params.set("deck_id", state.filters.deckId);
  const data = await api(`/api/items?${params.toString()}`);
  state.items = data.items || [];
  renderItems();
}

function renderItems() {
  const body = $("#itemsBody");
  body.innerHTML = state.items.map((item) => {
    const checked = state.selectedIds.has(item.id) ? "checked" : "";
    const tags = (item.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    const tagHtml = tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : `<span class="muted">${t("labels.noTags")}</span>`;
    const missing = item.exists ? "" : `<span class="danger">${t("labels.fileMissing")}</span>`;
    const deck = (state.decks || []).find((row) => row.id === item.deck_id);
    return `
      <tr data-item-id="${item.id}">
        <td class="check-cell"><input class="row-check" type="checkbox" data-id="${item.id}" ${checked}></td>
        <td class="file-cell">
          <div class="file-main">
            <strong title="${escapeHtml(item.file_path)}">${escapeHtml(item.file_name)}</strong>
            <span class="file-sub">${escapeHtml(item.relative_path || item.file_path)} ${missing}</span>
            <div class="tag-line">${tagHtml}</div>
          </div>
        </td>
        <td><span class="deck-pill" style="border-color:${escapeHtml(deck?.color || "#d9e0ea")}">${escapeHtml(deck?.name || t("decks.all"))}</span></td>
        <td>${dayText(item.due_at)}</td>
        <td>${Math.round(item.retrievability * 100)}%</td>
        <td>${item.review_count}</td>
        <td>${hms(item.total_read_seconds)}</td>
        <td>
          <div class="actions-cell">
            <button class="icon-button" title="${t("labels.reviewButton")}" data-start-review="${item.id}">▶</button>
            <button class="icon-button" title="${t("actions.openFile")}" data-open-item="${item.id}">↗</button>
            <button class="icon-button" title="${t("actions.folder")}" data-folder-item="${item.id}">⌖</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  if (!state.items.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state friendly-empty">
      <strong>${t("empty.noItemsTitle")}</strong>
      <span>${t("empty.noItemsBody")}</span>
      <button class="primary-button" id="emptyTableAddLibraryBtn">${t("actions.addLibrary")}</button>
    </div></td></tr>`;
  }
}

async function chooseLibrary() {
  toast(t("toast.openingFolderPicker"));
  const result = await api("/api/libraries/select", { method: "POST", body: { deck_id: state.filters.deckId || null } });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  if (result.scan) {
    toast(t("toast.scanDone", { added: result.scan.added, updated: result.scan.updated }));
    await loadOverview();
    await loadItems();
    return;
  }
  await addLibraryPath(result.path);
}

async function addLibraryPath(path) {
  const rootPath = String(path || "").trim();
  if (!rootPath) {
    toast(t("toast.pathRequired"), true);
    return;
  }
  const result = await api("/api/libraries/add", { method: "POST", body: { path: rootPath, deck_id: state.filters.deckId || null } });
  toast(t("toast.scanDone", { added: result.scan.added, updated: result.scan.updated }));
  await loadOverview();
  await loadItems();
}

async function deleteLibrary(libraryId) {
  const library = (state.libraries || []).find((item) => String(item.id) === String(libraryId));
  if (!library) return;
  if (!confirm(t("confirm.deleteLibrary", { name: library.display_name || library.root_path, count: library.file_count || 0 }))) {
    return;
  }
  const result = await api("/api/libraries/delete", {
    method: "POST",
    body: { id: Number(libraryId), remove_items: true },
  });
  if (String(state.activeLibraryId || "") === String(libraryId)) {
    state.activeLibraryId = null;
    state.treeRel = "";
  }
  toast(t("toast.libraryDeleted", { count: result.removed_items || 0 }));
  await loadOverview();
  await loadItems();
}

async function chooseFile() {
  toast(t("toast.openingFolderPicker"));
  const result = await api("/api/files/select", { method: "POST", body: { deck_id: state.filters.deckId || null } });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  const item = result.file?.item || {};
  toast(t("toast.fileAdded", { name: item.file_name || result.file?.file_path || "" }));
  await loadOverview();
  await loadItems();
}

async function scanAll() {
  toast(t("toast.scanAll"));
  const result = await api("/api/libraries/scan", { method: "POST", body: {} });
  const total = (result.scans || []).reduce((sum, scan) => sum + scan.added + scan.updated, 0);
  toast(t("toast.scanAllDone", { count: total, missing: (result.missing || []).length }));
  await loadOverview();
  await loadItems();
}

async function startReview(itemId = null) {
  const result = await api("/api/review/start", { method: "POST", body: itemId ? { item_id: Number(itemId) } : {} });
  if (!result.item) {
    toast(t("toast.noDue"));
    return;
  }
  state.review.item = result.item;
  state.review.sessionId = result.session_id;
  state.review.startedAt = Date.now();
  setView("review");
  renderReview();
  loadHistory(result.item.id);
}

async function renderReview() {
  const item = state.review.item;
  if (!item) return;
  $("#reviewFileName").textContent = item.file_name;
  $("#reviewMeta").textContent = `${item.tags || t("labels.noTags")} · ${t("labels.reviewRound", { count: item.review_count + 1 })} · ${item.file_path}`;
  // Index-only model: the preview URL is resolved on demand from the original
  // file (handle / session File / offline copy) rather than pre-stored bytes.
  if ((!item.preview_url || String(item.preview_url).startsWith("__preview__")) &&
      typeof LocalAPI !== "undefined" && LocalAPI.previewUrl) {
    try {
      const url = await LocalAPI.previewUrl(item.id);
      if (url) item.preview_url = url;
    } catch (e) { /* leave placeholder; renderPreview shows fallback */ }
  }
  renderPreview(item);
  startTimer();
  loadLinksFor("item", item.id).catch(reportError);
}

function renderPreview(item) {
  const area = $("#previewArea");
  const ext = (item.ext || "").toLowerCase();
  const url = item.preview_url;
  if (!item.exists) {
    area.innerHTML = `<div class="empty-state"><strong>${t("empty.fileMissing")}</strong><span>${escapeHtml(item.file_path)}</span></div>`;
    return;
  }
  if (!url || String(url).startsWith("__preview__")) {
    // Index-only model: no locally resolvable copy. Offer to re-point at the
    // original file (e.g. after a browser reload on a non-Chromium browser).
    area.innerHTML = `<div class="empty-state"><strong>${escapeHtml(item.file_name)}</strong><span>${escapeHtml(item.file_path)}</span><div class="review-actions"><button class="primary-button" data-open-item="${item.id}">${t("actions.openFile")}</button></div></div>`;
    return;
  }
  if ([".pdf"].includes(ext)) {
    area.innerHTML = `<embed src="${url}" type="application/pdf">`;
  } else if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
    area.innerHTML = `<img src="${url}" alt="${escapeHtml(item.file_name)}">`;
  } else if ([".mp4", ".mkv", ".mov", ".avi", ".wmv"].includes(ext)) {
    area.innerHTML = `<video src="${url}" controls></video>`;
  } else if ([".mp3", ".wav", ".m4a"].includes(ext)) {
    area.innerHTML = `<div class="empty-state"><strong>${escapeHtml(item.file_name)}</strong><audio src="${url}" controls></audio></div>`;
  } else if ([".html", ".htm", ".txt", ".md"].includes(ext)) {
    area.innerHTML = `<iframe src="${url}" title="${escapeHtml(item.file_name)}"></iframe>`;
  } else {
    area.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(item.file_name)}</strong>
        <span>${escapeHtml(item.file_path)}</span>
        <div class="review-actions">
          <button class="primary-button" data-open-item="${item.id}">${t("actions.openFile")}</button>
          <button class="secondary-button" onclick="openItemWith(${item.id})">${t("actions.openWithShort")}</button>
        </div>
      </div>
    `;
  }
  const tools = document.createElement("div");
  tools.className = "preview-tools";
  tools.innerHTML = `
    <button class="secondary-button" data-link-selection="item:${item.id}">${t("actions.linkSelection")}</button>
    <button class="secondary-button" data-open-tab="${escapeHtml(url)}">${t("actions.openTab")}</button>
  `;
  area.prepend(tools);
  const linkPanel = document.createElement("div");
  linkPanel.id = "linkPanel";
  linkPanel.className = "link-panel";
  area.appendChild(linkPanel);
}

function startTimer() {
  clearInterval(state.review.timerId);
  state.review.timerId = setInterval(() => {
    if (!state.review.startedAt) return;
    $("#reviewTimer").textContent = hms((Date.now() - state.review.startedAt) / 1000);
  }, 500);
}

async function finishReview(rating) {
  const item = state.review.item;
  if (!item) {
    toast(t("toast.startFirst"), true);
    return;
  }
  const duration = Math.floor((Date.now() - state.review.startedAt) / 1000);
  const result = await api("/api/review/finish", {
    method: "POST",
    body: {
      item_id: item.id,
      session_id: state.review.sessionId,
      rating: Number(rating),
      duration_seconds: duration,
    },
  });
  state.review.item = result.item;
  toast(t("toast.reviewSaved", { date: dayText(result.item.due_at) }));
  await loadOverview();
  await loadItems();
  await loadHistory(item.id);
}

async function loadHistory(itemId) {
  const data = await api(`/api/history/${itemId}`);
  const rows = data.history || [];
  $("#historyList").innerHTML = rows.length
    ? rows.map((row) => `
      <div class="history-row">
        <strong>${escapeHtml(row.rating_label)} · ${hms(row.duration_seconds)}</strong>
        <span>${dayText(row.ended_at)} · ${escapeHtml(row.algorithm || "")} · ${t("labels.intervalDays", { days: Number(row.scheduled_days || 0).toFixed(1) })}</span>
      </div>
    `).join("")
    : `<p class="muted">${t("empty.noHistory")}</p>`;
}

async function openItem(id) {
  await api("/api/items/open", { method: "POST", body: { id: Number(id) } });
}

async function openItemWith(id) {
  await api("/api/items/open-with", { method: "POST", body: { id: Number(id) } });
}

async function openFolder(id) {
  await api("/api/items/open-folder", { method: "POST", body: { id: Number(id) } });
}

async function openFolderByPath(path) {
  await api("/api/path/open", { method: "POST", body: { path } });
}

function getSelectedTextForSource(sourceType) {
  if (sourceType === "note") {
    const editor = $("#noteEditor");
    if (!editor) return "";
    return editor.value.slice(editor.selectionStart || 0, editor.selectionEnd || 0).trim();
  }
  const frame = $("#previewArea iframe");
  try {
    const frameSelection = frame?.contentWindow?.getSelection?.().toString() || "";
    if (frameSelection.trim()) return frameSelection.trim();
  } catch {
    // Cross-origin or plugin-rendered previews cannot expose selection text.
  }
  return (window.getSelection?.().toString() || "").trim();
}

async function loadLinksFor(sourceType, sourceId) {
  if (!sourceType || !sourceId) return;
  const result = await api(`/api/links?source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`);
  state.links = result.links || [];
  renderLinks(sourceType, sourceId);
}

function renderLinks(sourceType, sourceId) {
  let panel = sourceType === "note" ? $("#noteLinksPanel") : $("#linkPanel");
  if (sourceType === "note" && !panel) {
    const pathNode = $("#notePath");
    if (pathNode) {
      panel = document.createElement("div");
      panel.id = "noteLinksPanel";
      panel.className = "link-panel note-link-panel";
      pathNode.insertAdjacentElement("afterend", panel);
    }
  }
  if (!panel) return;
  const links = state.links || [];
  panel.innerHTML = `
    <div class="link-head">
      <strong>${t("links.title")}</strong>
      <button class="text-button" data-link-selection="${sourceType}:${sourceId}">${t("actions.linkSelection")}</button>
    </div>
    ${links.length ? links.map((link) => `
      <div class="link-row">
        <div>
          <strong>${escapeHtml(link.target?.label || link.target_label || "")}</strong>
          <span>${escapeHtml(link.selected_text || link.note || "")}</span>
        </div>
        <button class="icon-button" data-open-linked-target="${escapeHtml(link.target_type)}:${link.target_id}" title="${t("actions.openTab")}">↗</button>
        <button class="icon-button" data-delete-link="${link.id}" title="Delete">x</button>
      </div>
    `).join("") : `<p class="muted">${t("links.empty")}</p>`}
  `;
}

async function createLinkFromSelection(sourceType, sourceId) {
  sourceId = Number(sourceId);
  const selectedText = getSelectedTextForSource(sourceType);
  if (!selectedText) {
    toast(t("toast.noSelection"), true);
    return;
  }
  const keyword = prompt(t("prompt.chooseLinkTarget"), selectedText.slice(0, 40));
  if (keyword === null) return;
  const targetsResult = await api(`/api/link-targets?q=${encodeURIComponent(keyword)}&limit=20`);
  const targets = (targetsResult.targets || []).filter((target) => !(target.type === sourceType && Number(target.id) === sourceId));
  if (!targets.length) {
    toast(t("empty.noItemsTitle"), true);
    return;
  }
  const menu = targets.map((target, index) => `${index + 1}. [${target.type}] ${target.label}`).join("\n");
  const answer = prompt(`${t("links.target")}\n${menu}`);
  if (answer === null) return;
  const index = Number(answer) - 1;
  const target = Number.isInteger(index) && targets[index]
    ? targets[index]
    : targets.find((row) => String(row.id) === String(answer) || row.label === answer);
  if (!target) return;
  const note = prompt(t("prompt.linkNote"), "") || "";
  await api("/api/links/create", {
    method: "POST",
    body: {
      source_type: sourceType,
      source_id: sourceId,
      selected_text: selectedText,
      target_type: target.type,
      target_id: target.id,
      note,
    },
  });
  toast(t("toast.linkCreated"));
  await loadLinksFor(sourceType, sourceId);
}

async function openLinkedTarget(value) {
  const [type, id] = String(value || "").split(":");
  if (type === "item") {
    window.open(`/api/file/${encodeURIComponent(id)}`, "_blank", "noopener");
  } else if (type === "note") {
    window.open(`/api/note-file/${encodeURIComponent(id)}`, "_blank", "noopener");
  }
}

async function deleteLink(linkId) {
  if (!confirm(t("confirm.deleteLink"))) return;
  await api("/api/links/delete", { method: "POST", body: { id: Number(linkId) } });
  if (state.review.item) await loadLinksFor("item", state.review.item.id);
  if (state.activeNoteId) await loadLinksFor("note", state.activeNoteId);
}

async function loadNotes(itemId = null) {
  const suffix = itemId ? `?item_id=${encodeURIComponent(itemId)}` : "";
  const data = await api(`/api/notes${suffix}`);
  state.notes = data.notes || [];
  const available = new Set(state.notes.map((note) => note.id));
  state.selectedNoteIds = new Set(Array.from(state.selectedNoteIds).filter((id) => available.has(id)));
  renderNotesList();
}

function renderNotesList() {
  const target = $("#notesList");
  if (!target) return;
  const count = state.selectedNoteIds.size;
  const summary = $("#noteSelectionSummary");
  if (summary) summary.textContent = count ? t("notes.selectionCount", { count }) : t("notes.selectionEmpty");
  target.innerHTML = state.notes.length
    ? state.notes.map((note) => `
      <div class="note-row ${note.id === state.activeNoteId ? "active" : ""}">
        <label class="note-check">
          <input class="note-row-check" type="checkbox" data-note-check="${note.id}" ${state.selectedNoteIds.has(note.id) ? "checked" : ""}>
          <span></span>
        </label>
        <button class="note-row-main" data-note-id="${note.id}">
          <strong>${escapeHtml(note.title)}</strong>
          <span>${dayText(note.updated_at)} · ${escapeHtml(note.size || "")}</span>
          <span>${escapeHtml(note.file_path)}</span>
        </button>
      </div>
    `).join("")
    : `<div class="empty-state friendly-empty"><strong>${t("notes.empty")}</strong></div>`;
}

async function createNote({ itemId = null, localMode = false } = {}) {
  const baseTitle = state.review.item && itemId ? `${state.review.item.file_name} 复习笔记` : t("actions.newNote");
  const result = await api("/api/notes/create", {
    method: "POST",
    body: {
      item_id: itemId,
      title: baseTitle,
      source: localMode ? "local" : "app",
      open_local: localMode || Boolean(state.config?.notes?.open_local_note_after_create),
    },
  });
  state.activeNoteId = result.note.id;
  toast(t("toast.noteCreated"));
  await loadNotes();
  await loadNote(result.note.id);
  setView("notes");
}

async function loadNote(noteId) {
  const result = await api(`/api/notes/${noteId}`);
  const note = result.note;
  state.activeNoteId = note.id;
  $("#noteTitleInput").value = note.title || "";
  $("#noteEditor").value = note.content || "";
  $("#notePath").textContent = note.file_path || "";
  await loadLinksFor("note", note.id);
  renderNotesList();
}

async function saveNote() {
  if (!state.activeNoteId) {
    toast(t("toast.noNoteSelected"), true);
    return;
  }
  const result = await api("/api/notes/save", {
    method: "POST",
    body: {
      id: state.activeNoteId,
      title: $("#noteTitleInput").value,
      content: $("#noteEditor").value,
    },
  });
  toast(t("toast.noteSaved"));
  await loadNotes();
  await loadNote(result.note.id);
}

async function openNote(chooseApp = false) {
  if (!state.activeNoteId) {
    toast(t("toast.noNoteSelected"), true);
    return;
  }
  await api("/api/notes/open", { method: "POST", body: { id: state.activeNoteId, choose_app: chooseApp } });
}

function selectedNoteIdsOrActive() {
  const ids = Array.from(state.selectedNoteIds);
  if (!ids.length && state.activeNoteId) ids.push(state.activeNoteId);
  return ids;
}

async function exportSelectedNotes() {
  const ids = selectedNoteIdsOrActive();
  if (!ids.length) {
    toast(t("toast.selectNotesFirst"), true);
    return;
  }
  const targetDir = await chooseExportFolderForAction();
  if (!targetDir) return;
  const result = await api("/api/notes/export", {
    method: "POST",
    body: { ids, target_dir: targetDir },
  });
  toast(t("toast.notesExported", { count: result.exported || 0, path: result.export_dir || "" }));
}

async function deleteSelectedNotes(ids = selectedNoteIdsOrActive()) {
  if (!ids.length) {
    toast(t("toast.selectNotesFirst"), true);
    return;
  }
  if (!confirm(t("confirm.deleteNotes", { count: ids.length }))) return;
  const result = await api("/api/notes/delete", { method: "POST", body: { ids, delete_files: true } });
  ids.forEach((id) => state.selectedNoteIds.delete(Number(id)));
  if (ids.includes(state.activeNoteId)) {
    state.activeNoteId = null;
    $("#noteTitleInput").value = "";
    $("#noteEditor").value = "";
    $("#notePath").textContent = "";
  }
  toast(t("toast.notesDeleted", { count: result.deleted || ids.length }));
  await loadNotes();
}

async function batchTag() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  const value = prompt(t("prompt.tags"));
  if (value === null) return;
  await api("/api/items/update", { method: "POST", body: { ids, fields: { tags: value } } });
  toast(t("toast.tagUpdated", { count: ids.length }));
  await loadItems();
}

async function createDeck(parentId = null) {
  const name = prompt(t("prompt.deckName"));
  if (!name) return;
  const description = prompt(t("prompt.deckDescription")) || "";
  const result = await api("/api/decks/create", { method: "POST", body: { name, description, parent_id: parentId } });
  toast(t("toast.deckCreated", { name: result.deck?.name || name }));
  await loadOverview();
  state.filters.deckId = String(result.deck?.id || "");
  renderDecks();
  await loadItems();
}

async function renameDeck(deckId) {
  const deck = (state.decks || []).find((item) => String(item.id) === String(deckId));
  if (!deck) return;
  const name = prompt(t("prompt.renameDeck"), deck.name);
  if (!name || name === deck.name) return;
  await api("/api/decks/update", { method: "POST", body: { id: Number(deckId), name } });
  toast(t("toast.deckUpdated"));
  await loadOverview();
  await loadItems();
}

function askDeckId() {
  const decks = state.decks || [];
  if (!decks.length) return "";
  const menu = decks.map((deck, index) => `${index + 1}. ${deck.full_name || deck.name}`).join("\n");
  const answer = prompt(`${t("prompt.chooseDeck")}\n${menu}`);
  if (answer === null) return null;
  const index = Number(answer) - 1;
  if (Number.isInteger(index) && decks[index]) return decks[index].id;
  const matched = decks.find((deck) => String(deck.id) === String(answer) || deck.name === answer || deck.full_name === answer);
  return matched ? matched.id : "";
}

async function batchAssignDeck() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  const deckId = askDeckId();
  if (!deckId) return;
  await api("/api/items/update", { method: "POST", body: { ids, fields: { deck_id: Number(deckId) } } });
  toast(t("toast.deckAssigned", { count: ids.length }));
  state.selectedIds.clear();
  await loadOverview();
  await loadItems();
}

async function deleteDeck(deckId) {
  const deck = (state.decks || []).find((item) => String(item.id) === String(deckId));
  if (!deck || deck.is_default) return;
  if (!confirm(t("confirm.deleteDeck", { name: deck.name }))) return;
  await api("/api/decks/delete", { method: "POST", body: { id: Number(deckId) } });
  if (String(state.filters.deckId) === String(deckId)) state.filters.deckId = "";
  toast(t("toast.deckDeleted"));
  await loadOverview();
  await loadItems();
}

function deckIdsInSubtree(deckId) {
  const ids = new Set([Number(deckId)]);
  let changed = true;
  while (changed) {
    changed = false;
    (state.decks || []).forEach((deck) => {
      if (deck.parent_id && ids.has(Number(deck.parent_id)) && !ids.has(Number(deck.id))) {
        ids.add(Number(deck.id));
        changed = true;
      }
    });
  }
  return ids;
}

async function reorderDecksByDrag(dragId, dropId, asChild = false) {
  dragId = Number(dragId);
  dropId = Number(dropId);
  if (!dragId || !dropId || dragId === dropId) return;
  const decks = [...(state.decks || [])].map((deck) => ({ ...deck }));
  const drag = decks.find((deck) => Number(deck.id) === dragId);
  const drop = decks.find((deck) => Number(deck.id) === dropId);
  if (!drag || !drop) return;
  if (asChild && deckIdsInSubtree(dragId).has(dropId)) return;
  const without = decks.filter((deck) => Number(deck.id) !== dragId);
  drag.parent_id = asChild ? dropId : (drop.parent_id || null);
  let insertIndex = without.findIndex((deck) => Number(deck.id) === dropId);
  if (insertIndex < 0) insertIndex = without.length - 1;
  without.splice(insertIndex + 1, 0, drag);
  const counters = {};
  const rows = without.map((deck) => {
    const key = String(deck.parent_id || "root");
    counters[key] = (counters[key] || 0) + 1;
    return { id: deck.id, parent_id: deck.parent_id || null, sort_order: counters[key] };
  });
  const result = await api("/api/decks/reorder", { method: "POST", body: { decks: rows } });
  state.decks = result.decks || [];
  state.overview.decks = state.decks;
  toast(t("toast.deckUpdated"));
  renderDecks();
  await loadItems();
}

function bindDeckDrag() {
  const list = $("#deckList");
  if (!list || list.dataset.dragBound === "1") return;
  list.dataset.dragBound = "1";
  list.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-deck-id]");
    if (!item) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.deckId);
    item.classList.add("dragging");
  });
  list.addEventListener("dragend", () => {
    $$(".deck-item.dragging, .deck-item.drag-over, .deck-item.drop-child").forEach((node) => {
      node.classList.remove("dragging", "drag-over", "drop-child");
    });
  });
  list.addEventListener("dragover", (event) => {
    const item = event.target.closest("[data-deck-id]");
    if (!item) return;
    event.preventDefault();
    const bounds = item.getBoundingClientRect();
    const asChild = event.clientX - bounds.left > 58;
    $$(".deck-item.drag-over, .deck-item.drop-child").forEach((node) => node.classList.remove("drag-over", "drop-child"));
    item.classList.add(asChild ? "drop-child" : "drag-over");
  });
  list.addEventListener("drop", async (event) => {
    const item = event.target.closest("[data-deck-id]");
    if (!item) return;
    event.preventDefault();
    const dragId = event.dataTransfer.getData("text/plain");
    const bounds = item.getBoundingClientRect();
    const asChild = event.clientX - bounds.left > 58;
    await reorderDecksByDrag(dragId, item.dataset.deckId, asChild);
  });
}

async function exportSharePackage() {
  const ids = Array.from(state.selectedIds);
  const includeFiles = confirm(t("confirm.includeFiles"));
  const targetPath = await chooseSavePath({
    defaultName: `LiFileReviewer_share_${stamp()}.zip`,
    extension: ".zip",
    fileTypes: ["Zip files (*.zip)", "All files (*.*)"],
    title: t("dialog.exportShare"),
  });
  if (!targetPath) return;
  const result = await api("/api/share/export", {
    method: "POST",
    body: {
      ids,
      deck_id: ids.length ? null : (state.filters.deckId || null),
      include_files: includeFiles,
      target_path: targetPath,
    },
  });
  toast(t("toast.shareExported", { path: result.export_path }));
}

async function batchSuspend() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  await api("/api/items/update", { method: "POST", body: { ids, fields: { status: "suspended" } } });
  toast(t("toast.suspended", { count: ids.length }));
  state.selectedIds.clear();
  await loadItems();
  await loadOverview();
}

async function batchSetStatus(status, label) {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  await api("/api/items/update", { method: "POST", body: { ids, fields: { status } } });
  toast(t("toast.statusChanged", { label, count: ids.length }));
  state.selectedIds.clear();
  await loadItems();
  await loadOverview();
}

async function batchDueToday() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  await api("/api/items/update", {
    method: "POST",
    body: { ids, fields: { due_at: new Date().toISOString().slice(0, 19) } },
  });
  toast(t("toast.dueToday", { count: ids.length }));
  state.selectedIds.clear();
  await loadItems();
  await loadOverview();
}

async function batchDelete() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    toast(t("toast.selectFirst"), true);
    return;
  }
  if (!confirm(t("confirm.delete", { count: ids.length }))) return;
  await api("/api/items/delete", { method: "POST", body: { ids } });
  toast(t("toast.deleted", { count: ids.length }));
  state.selectedIds.clear();
  await loadItems();
  await loadOverview();
}

function renderSettings() {
  if (!state.config) return;
  const scheduler = state.config.scheduler || {};
  const reminders = state.config.reminders || {};
  const review = state.config.review || {};
  const ui = state.config.ui || {};
  const notes = state.config.notes || {};
  const exportsConfig = state.config.exports || {};
  $("#algorithmSelect").value = scheduler.algorithm || "FSRS-Lite";
  $("#retentionInput").value = scheduler.desired_retention || 0.9;
  $("#maxReviewsInput").value = scheduler.max_reviews_per_day || 120;
  $("#reminderTimeInput").value = reminders.time || "20:30";
  $("#reminderEnabledInput").checked = Boolean(reminders.enabled);
  $("#autoOpenInput").checked = Boolean(review.auto_open_file);
  $("#notesDirInput").value = notes.storage_dir || state.overview?.app?.notes_dir || "";
  $("#exportDirInput").value = exportsConfig.default_dir || state.overview?.app?.export_dir || "";
  $("#localNoteOpenInput").checked = Boolean(notes.open_local_note_after_create);
  $("#themeSelect").value = ui.theme || "light";
  $("#languageSelect").value = ui.language || state.lang || "zh-CN";
  $("#accentInput").value = ui.accent || "#2563eb";
  $("#customCssInput").value = ui.custom_css || "";
  const app = state.overview?.app || {};
  $("#configPath").textContent = app.config_path || "";
  $("#dbPath").textContent = app.db_path || "";
  $("#appDir").textContent = app.app_dir || "";
  $("#logPath").textContent = app.log_path || "";
  $("#pluginsPath").textContent = app.plugins_dir || "";
  $("#notesPath").textContent = app.notes_dir || "";
  $("#exportsPath").textContent = app.export_dir || "";
  $("#pointerPath").textContent = app.profile_pointer_path || "";
  $("#profileDirInput").value = app.app_dir || "";
  renderPlugins();
  renderSocialProfile();
}

async function saveSettings() {
  const config = {
    scheduler: {
      algorithm: $("#algorithmSelect").value,
      desired_retention: Number($("#retentionInput").value || 0.9),
      max_reviews_per_day: Number($("#maxReviewsInput").value || 120),
    },
    reminders: {
      enabled: $("#reminderEnabledInput").checked,
      time: $("#reminderTimeInput").value || "20:30",
      browser_notifications: true,
    },
    review: {
      auto_open_file: $("#autoOpenInput").checked,
    },
    notes: {
      storage_dir: $("#notesDirInput").value.trim(),
      default_extension: ".md",
      open_local_note_after_create: $("#localNoteOpenInput").checked,
    },
    exports: {
      default_dir: $("#exportDirInput").value.trim(),
    },
    ui: {
      language: $("#languageSelect").value,
      theme: $("#themeSelect").value,
      accent: $("#accentInput").value,
      custom_css: $("#customCssInput").value,
    },
  };
  const result = await api("/api/settings", { method: "POST", body: { config } });
  state.config = result.config;
  state.lang = result.config?.ui?.language || "zh-CN";
  localStorage.setItem("fileReviewerLanguage", state.lang);
  applyI18n();
  applyTheme();
  toast(t("toast.settingsSaved"));
  await loadOverview();
}

function getExportDir() {
  return ($("#exportDirInput")?.value || state.config?.exports?.default_dir || state.overview?.app?.export_dir || "").trim();
}

function stamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

async function chooseSavePath({ defaultName, extension, fileTypes, title }) {
  toast(t("toast.openingSavePicker"));
  const result = await api("/api/export/save-as", {
    method: "POST",
    body: {
      default_name: defaultName,
      extension,
      file_types: fileTypes,
      title,
      initial_dir: getExportDir(),
    },
  });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return "";
  }
  return result.path || "";
}

async function chooseExportFolderForAction() {
  toast(t("toast.openingFolderPicker"));
  const result = await api("/api/export/select-dir", { method: "POST", body: {} });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return "";
  }
  return result.path || "";
}

async function chooseExportDir() {
  toast(t("toast.openingFolderPicker"));
  const result = await api("/api/export/select-dir", { method: "POST", body: {} });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  $("#exportDirInput").value = result.path || "";
  const config = { exports: { default_dir: result.path || "" } };
  const saved = await api("/api/settings", { method: "POST", body: { config } });
  state.config = saved.config;
  toast(t("toast.exportDirSelected", { path: result.path || "" }));
  await loadOverview();
}

async function openExportDir() {
  const target = getExportDir();
  if (!target) {
    toast(t("toast.pathRequired"), true);
    return;
  }
  await openFolderByPath(target);
}

async function backup() {
  const targetPath = await chooseSavePath({
    defaultName: `review_data_manual_${stamp()}.sqlite`,
    extension: ".sqlite",
    fileTypes: ["SQLite database (*.sqlite)", "All files (*.*)"],
    title: t("dialog.backupDb"),
  });
  if (!targetPath) return;
  const result = await api("/api/backup", { method: "POST", body: { target_path: targetPath } });
  toast(t("toast.backupDone", { path: result.backup_path }));
}

async function exportProfile() {
  const targetPath = await chooseSavePath({
    defaultName: `LiFileReviewer2_profile_${stamp()}.zip`,
    extension: ".zip",
    fileTypes: ["Zip files (*.zip)", "All files (*.*)"],
    title: t("dialog.exportProfile"),
  });
  if (!targetPath) return;
  const result = await api("/api/export-profile", { method: "POST", body: { target_path: targetPath } });
  toast(t("toast.profileExported", { path: result.export_path }));
}

async function chooseProfileDir() {
  toast(t("toast.openingFolderPicker"));
  const result = await api("/api/profile/select", { method: "POST", body: {} });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  $("#profileDirInput").value = result.path || "";
}

async function moveProfile() {
  const path = $("#profileDirInput").value.trim();
  if (!path) {
    toast(t("toast.pathRequired"), true);
    return;
  }
  const button = $("#moveProfileBtn");
  button.disabled = true;
  toast(t("toast.movingProfile"));
  try {
    const result = await api("/api/profile/move", { method: "POST", body: { path } });
    state.overview.app = result.app || state.overview.app;
    toast(t("toast.profileMoved", { path: result.app?.app_dir || path }));
    await loadOverview();
    renderSettings();
    await healthCheck();
  } catch (error) {
    reportError(error);
  } finally {
    button.disabled = false;
  }
}

async function chooseImportProfilePackage() {
  const result = await api("/api/profile/select-package", { method: "POST", body: {} });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  $("#importProfilePathInput").value = result.path || "";
  toast(t("toast.packageSelected"));
}

async function importProfile() {
  const path = $("#importProfilePathInput").value.trim();
  if (!path) {
    toast(t("toast.pathRequired"), true);
    return;
  }
  const backupTargetPath = await chooseSavePath({
    defaultName: `LiFileReviewer2_before_import_${stamp()}.zip`,
    extension: ".zip",
    fileTypes: ["Zip files (*.zip)", "All files (*.*)"],
    title: t("dialog.backupBeforeImport"),
  });
  if (!backupTargetPath) return;
  const result = await api("/api/profile/import", { method: "POST", body: { path, backup_target_path: backupTargetPath } });
  toast(t("toast.profileImported", { path: result.backup_before_import }));
  await loadOverview();
  await loadItems();
  await healthCheck();
}

async function openProfileFolder() {
  const appDir = state.overview?.app?.app_dir;
  if (appDir) await openFolderByPath(appDir);
}

async function openPluginsFolder() {
  const pluginsDir = state.overview?.app?.plugins_dir;
  if (pluginsDir) await openFolderByPath(pluginsDir);
}

async function loadPlugins() {
  try {
    const result = await api("/api/plugins");
    state.plugins = result.plugins || [];
  } catch {
    state.plugins = [];
  }
  renderPlugins();
}

async function importPlugin(kind) {
  const path = kind === "folder" ? "/api/plugins/import/select-folder" : "/api/plugins/import/select-file";
  const result = await api(path, { method: "POST", body: { enable: true } });
  if (result.cancelled) {
    toast(t("toast.cancelled"));
    return;
  }
  state.plugins = result.plugins || [];
  toast(t("plugins.imported", { name: result.plugin?.name || result.plugin?.id || "" }));
  await loadOverview();
}

function renderPlugins() {
  const target = $("#pluginsList");
  if (!target) return;
  const plugins = state.plugins || [];
  target.innerHTML = plugins.length
    ? plugins.map((plugin) => `
      <div class="plugin-row">
        <div class="plugin-main">
          <strong>${escapeHtml(plugin.name || plugin.id)}</strong>
          <span>${escapeHtml(plugin.version || "")} · ${escapeHtml(plugin.source || "external")} · ${escapeHtml(plugin.category || "")}</span>
          <span>${escapeHtml(plugin.description || plugin.path || "")}</span>
        </div>
        <label class="switch-line">
          <input type="checkbox" data-plugin-toggle="${escapeHtml(plugin.id)}" ${plugin.enabled ? "checked" : ""}>
          <span>${plugin.enabled ? t("plugins.enabled") : t("plugins.disabled")}</span>
        </label>
      </div>
    `).join("")
    : `<p class="muted">${t("plugins.empty")}</p>`;
}

function renderSocialProfile() {
  const host = $("#settingsPluginHost");
  if (!host) return;
  const profile = state.social?.profile || state.config?.social || {};
  const enabled = Boolean(state.social?.enabled);
  if (!enabled) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = `
    <div class="social-box" data-plugin-module="social_profile">
      <div class="panel-head compact-head">
        <h4>${t("social.title")}</h4>
        <button id="saveSocialBtn" class="text-button">${t("actions.save")}</button>
      </div>
      <div class="form-grid social-grid">
        <label>
          <span>${t("social.displayName")}</span>
          <input id="socialDisplayNameInput" type="text">
        </label>
        <label>
          <span>${t("social.handle")}</span>
          <input id="socialHandleInput" type="text" placeholder="@your-name">
        </label>
        <label>
          <span>${t("social.website")}</span>
          <input id="socialWebsiteInput" type="text">
        </label>
        <label>
          <span>${t("social.contact")}</span>
          <input id="socialContactInput" type="text">
        </label>
        <label class="wide-label">
          <span>${t("social.bio")}</span>
          <textarea id="socialBioInput" rows="3"></textarea>
        </label>
        <label class="toggle-line">
          <span>${t("social.shareStats")}</span>
          <input id="socialShareStatsInput" type="checkbox">
        </label>
        <label class="toggle-line">
          <span>${t("social.shareAchievements")}</span>
          <input id="socialShareAchievementsInput" type="checkbox">
        </label>
        <label class="toggle-line">
          <span>${t("social.friendDiscovery")}</span>
          <input id="socialFriendDiscoveryInput" type="checkbox">
        </label>
      </div>
      <div class="profile-actions">
        <button id="copySocialCardBtn" class="secondary-button">${t("social.copyCard")}</button>
      </div>
      <div id="socialStatus" class="muted"></div>
    </div>
  `;

  const fields = [
    ["#socialDisplayNameInput", "display_name"],
    ["#socialHandleInput", "handle"],
    ["#socialWebsiteInput", "website"],
    ["#socialContactInput", "contact"],
    ["#socialBioInput", "bio"],
  ];
  fields.forEach(([selector, key]) => {
    const node = $(selector);
    if (node) {
      node.value = profile[key] || "";
      node.disabled = !enabled;
    }
  });
  [
    ["#socialShareStatsInput", "share_stats"],
    ["#socialShareAchievementsInput", "share_achievements"],
    ["#socialFriendDiscoveryInput", "allow_friend_discovery"],
  ].forEach(([selector, key]) => {
    const node = $(selector);
    if (node) {
      node.checked = Boolean(profile[key]);
      node.disabled = !enabled;
    }
  });
  const save = $("#saveSocialBtn");
  const copy = $("#copySocialCardBtn");
  if (save) save.addEventListener("click", saveSocialProfile);
  if (copy) copy.addEventListener("click", copySocialCard);
  const status = $("#socialStatus");
  if (status) status.textContent = t("social.enabledHint");
}

async function togglePlugin(pluginId, enabled) {
  const result = await api("/api/plugins/toggle", { method: "POST", body: { id: pluginId, enabled } });
  state.plugins = result.plugins || [];
  toast(enabled ? t("plugins.enabledToast") : t("plugins.disabledToast"));
  await loadOverview();
}

async function saveSocialProfile() {
  const profile = {
    display_name: $("#socialDisplayNameInput")?.value.trim() || "",
    handle: $("#socialHandleInput")?.value.trim() || "",
    website: $("#socialWebsiteInput")?.value.trim() || "",
    contact: $("#socialContactInput")?.value.trim() || "",
    bio: $("#socialBioInput")?.value.trim() || "",
    share_stats: Boolean($("#socialShareStatsInput")?.checked),
    share_achievements: Boolean($("#socialShareAchievementsInput")?.checked),
    allow_friend_discovery: Boolean($("#socialFriendDiscoveryInput")?.checked),
  };
  const result = await api("/api/social/profile", { method: "POST", body: { profile } });
  state.social = result;
  state.config.social = result.profile || profile;
  renderSocialProfile();
  toast(t("social.saved"));
}

async function copySocialCard() {
  const result = await api("/api/social/card");
  const text = JSON.stringify(result, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    window.prompt(t("social.copyFallback"), text);
  }
  toast(t("social.cardCopied"));
}

async function healthCheck() {
  const result = await api("/api/health");
  renderHealth(result);
  toast(result.ok ? t("toast.healthOk") : t("toast.healthBad"), !result.ok);
}

function renderHealth(result) {
  $("#healthSummary").textContent = `${result.checked_at} · ${result.ok ? t("health.good") : t("health.needsAttention")} · ${t("labels.report", { path: result.report_path || "" })}`;
  $("#healthList").innerHTML = (result.checks || []).map((check) => `
    <div class="health-row">
      <div class="${check.ok ? "health-ok" : "health-bad"}">${check.ok ? "✓" : "!"}</div>
      <div>
        <strong>${escapeHtml(check.name)}</strong>
        <span>${escapeHtml(check.detail || "")}</span>
      </div>
    </div>
  `).join("");
}

async function exportCsv() {
  const targetPath = await chooseSavePath({
    defaultName: `review_items_${stamp()}.csv`,
    extension: ".csv",
    fileTypes: ["CSV files (*.csv)", "All files (*.*)"],
    title: t("dialog.exportCsv"),
  });
  if (!targetPath) return;
  const result = await api("/api/export", { method: "POST", body: { target_path: targetPath } });
  toast(t("toast.exported", { path: result.export_path }));
}

async function exportPortableJson() {
  const targetPath = await chooseSavePath({
    defaultName: `review_portable_${stamp()}.json`,
    extension: ".json",
    fileTypes: ["JSON files (*.json)", "All files (*.*)"],
    title: t("dialog.exportJson"),
  });
  if (!targetPath) return;
  const result = await api("/api/export-portable", { method: "POST", body: { target_path: targetPath } });
  toast(t("toast.exportedJson", { path: result.export_path }));
}

function requestNotificationsIfNeeded() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function setupReminderLoop() {
  setInterval(() => {
    const config = state.config || {};
    const reminders = config.reminders || {};
    const stats = state.overview?.stats || {};
    if (!reminders.enabled || !reminders.browser_notifications || !stats.due) return;
    const now = new Date();
    const [hour, minute] = String(reminders.time || "20:30").split(":").map(Number);
    if (now.getHours() === hour && now.getMinutes() === minute && Notification.permission === "granted") {
      new Notification(state.lang === "en-US" ? "File Review" : "智能文件复习系统", {
        body: state.lang === "en-US"
          ? `${stats.due} items are due today.`
          : `今天还有 ${stats.due} 个资料等待复习。`,
      });
    }
  }, 60000);
}

// ===== 新用户引导（聚光灯 tour） =====
const ONBOARDING_STEPS = [
  { titleKey: "onboarding.step1Title", bodyKey: "onboarding.step1Body", sel: null, view: null },
  { titleKey: "onboarding.step2Title", bodyKey: "onboarding.step2Body", sel: "#chooseLibraryBtn", view: "library" },
  { titleKey: "onboarding.stepAddFileTitle", bodyKey: "onboarding.stepAddFileBody", sel: "#chooseFileBtn", view: "library" },
  { titleKey: "onboarding.step3Title", bodyKey: "onboarding.step3Body", sel: "#startDueBtn", view: "dashboard" },
  { titleKey: "onboarding.stepSettingsTitle", bodyKey: "onboarding.stepSettingsBody", sel: '[data-view="settings"]', view: "settings" },
  { titleKey: "onboarding.stepHelpTitle", bodyKey: "onboarding.stepHelpBody", sel: '[data-view="help"]', view: "help" },
];

function startOnboarding() {
  try {
    state.onboardingStep = 0;
    const ob = $("#onboarding");
    if (!ob) { console.warn("[onboarding] #onboarding element not found"); return; }
    ob.classList.remove("hidden");
    renderOnboardingStep();
    // Verify the tour is actually visible after rendering
    requestAnimationFrame(() => {
      const overlay = $("#onboardingOverlay");
      if (overlay && !ob.classList.contains("hidden")) {
        // Add a brief pulse animation to draw attention
        ob.style.animation = "none";
        /* force reflow */ ob.offsetHeight;
        ob.style.animation = "";
      }
    });
  } catch (e) {
    console.error("[onboarding] startOnboarding error:", e);
  }
}

function showOnboardingIfNeeded() {
  try {
    // Default ON: show the tour for any first-time user (regardless of whether a
    // library already exists). Once the user finishes or skips it, the localStorage
    // flag is set and it won't auto-open again.
    const seen = localStorage.getItem("fileReviewerOnboardingDone") === "1";
    if (!seen) {
      // Defer to next paint cycle so the dashboard has fully rendered first.
      // Without this deferral, some browsers may not display the overlay correctly
      // when triggered synchronously at the end of an async init chain.
      requestAnimationFrame(() => { startOnboarding(); });
    }
  } catch (e) {
    console.error("[onboarding] showOnboardingIfNeeded error:", e);
  }
}

function closeOnboarding() {
  localStorage.setItem("fileReviewerOnboardingDone", "1");
  const ob = $("#onboarding");
  if (ob) ob.classList.add("hidden");
  clearOnboardingHighlight();
}

function clearOnboardingHighlight() {
  const spot = $("#onboardingSpot");
  if (spot) spot.style.display = "none";
  const overlay = $("#onboardingOverlay");
  if (overlay) overlay.classList.remove("onboarding-overlay--dim");
}

function updateOnboardingButtons() {
  const prev = $("#onboardingPrevBtn");
  const next = $("#onboardingNextBtn");
  if (!prev || !next) return;
  const last = ONBOARDING_STEPS.length - 1;
  prev.disabled = state.onboardingStep <= 0;
  next.textContent = t(state.onboardingStep >= last ? "actions.finish" : "actions.nextStep");
}

function positionCardNear(card, r) {
  const margin = 12;
  const cw = card.offsetWidth || 420;
  const ch = card.offsetHeight || 220;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = r.bottom + 12;
  if (top + ch > vh - margin) top = r.top - ch - 12;
  if (top < margin) top = margin;
  let left = r.left;
  if (left + cw > vw - margin) left = vw - cw - margin;
  if (left < margin) left = margin;
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";
  card.style.transform = "none";
}

function centerCard(card) {
  card.style.top = "50%";
  card.style.left = "50%";
  card.style.right = "auto";
  card.style.bottom = "auto";
  card.style.transform = "translate(-50%, -50%)";
}

function positionOnboardingSpot(sel) {
  const overlay = $("#onboardingOverlay");
  const spot = $("#onboardingSpot");
  const card = $("#onboardingCard");
  if (!spot || !overlay || !card) return;
  if (!sel) {
    overlay.classList.add("onboarding-overlay--dim");
    spot.style.display = "none";
    centerCard(card);
    return;
  }
  const el = $(sel);
  if (!el) {
    overlay.classList.add("onboarding-overlay--dim");
    spot.style.display = "none";
    centerCard(card);
    return;
  }
  overlay.classList.remove("onboarding-overlay--dim");
  const r = el.getBoundingClientRect();
  const pad = 6;
  spot.style.display = "block";
  spot.style.top = `${r.top - pad}px`;
  spot.style.left = `${r.left - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;
  spot.style.borderRadius = getComputedStyle(el).borderRadius || "10px";
  positionCardNear(card, r);
}

function renderOnboardingStep() {
  const steps = ONBOARDING_STEPS;
  const idx = Math.max(0, Math.min(steps.length - 1, state.onboardingStep));
  state.onboardingStep = idx;
  const step = steps[idx];
  const title = $("#onboardingTitle");
  const body = $("#onboardingBody");
  if (title) title.textContent = t(step.titleKey);
  if (body) body.textContent = t(step.bodyKey);
  const num = $("#onboardingStepNum");
  const total = $("#onboardingStepTotal");
  if (num) num.textContent = String(idx + 1);
  if (total) total.textContent = String(steps.length);
  const dots = $("#onboardingDots");
  if (dots) {
    dots.innerHTML = "";
    steps.forEach((_, i) => {
      const d = document.createElement("span");
      d.className = "dot" + (i === idx ? " active" : "");
      dots.appendChild(d);
    });
  }
  if (step.view) setView(step.view);
  positionOnboardingSpot(step.sel);
  updateOnboardingButtons();
}

function setupLibraryResizer() {
  const layout = $("#libraryLayout");
  const handle = $("#libraryResizer");
  if (!layout || !handle || handle.dataset.bound === "1") return;
  handle.dataset.bound = "1";
  const saved = Number(localStorage.getItem("libraryTreeWidth") || 0);
  if (saved) layout.style.setProperty("--library-tree-width", `${Math.min(620, Math.max(260, saved))}px`);
  let startX = 0;
  let startWidth = 0;
  const onMove = (event) => {
    const next = Math.min(680, Math.max(260, startWidth + event.clientX - startX));
    layout.style.setProperty("--library-tree-width", `${next}px`);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    const current = getComputedStyle(layout).getPropertyValue("--library-tree-width").trim();
    localStorage.setItem("libraryTreeWidth", String(parseInt(current, 10) || 330));
    document.body.classList.remove("resizing-layout");
  };
  handle.addEventListener("mousedown", (event) => {
    startX = event.clientX;
    startWidth = layout.querySelector(".library-tree-panel")?.getBoundingClientRect().width || 330;
    document.body.classList.add("resizing-layout");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    event.preventDefault();
  });
}

function bindEvents() {
  // Defensive helper: skips binding if element missing instead of crashing.
  function $bind(sel, ev, fn) { const el = $("#"+sel); if (el) el.addEventListener(ev, fn); }
  document.addEventListener("click", async (event) => {
    try {
      const nav = event.target.closest("[data-view]");
      if (nav) setView(nav.dataset.view);

      const viewLink = event.target.closest("[data-view-link]");
      if (viewLink) setView(viewLink.dataset.viewLink);

      const start = event.target.closest("[data-start-review]");
      if (start) await startReview(start.dataset.startReview);

      const open = event.target.closest("[data-open-item]");
      if (open) await openItem(open.dataset.openItem);

      const folder = event.target.closest("[data-folder-item]");
      if (folder) await openFolder(folder.dataset.folderItem);

      const openTab = event.target.closest("[data-open-tab]");
      if (openTab) {
        window.open(openTab.dataset.openTab, "_blank", "noopener");
        return;
      }

      const linkSelection = event.target.closest("[data-link-selection]");
      if (linkSelection) {
        const [sourceType, sourceId] = String(linkSelection.dataset.linkSelection || "").split(":");
        await createLinkFromSelection(sourceType, sourceId);
        return;
      }

      const linkedTarget = event.target.closest("[data-open-linked-target]");
      if (linkedTarget) {
        await openLinkedTarget(linkedTarget.dataset.openLinkedTarget);
        return;
      }

      const linkDelete = event.target.closest("[data-delete-link]");
      if (linkDelete) {
        await deleteLink(linkDelete.dataset.deleteLink);
        return;
      }

      const noteCheck = event.target.closest("[data-note-check]");
      if (noteCheck) {
        const id = Number(noteCheck.dataset.noteCheck);
        if (noteCheck.checked) state.selectedNoteIds.add(id);
        else state.selectedNoteIds.delete(id);
        renderNotesList();
        return;
      }

      const note = event.target.closest("[data-note-id]");
      if (note) await loadNote(Number(note.dataset.noteId));

      const libraryDelete = event.target.closest("[data-delete-library]");
      if (libraryDelete) {
        event.stopPropagation();
        await deleteLibrary(libraryDelete.dataset.deleteLibrary);
        return;
      }

      const library = event.target.closest("[data-library-id]");
      if (library) {
        state.activeLibraryId = Number(library.dataset.libraryId);
        state.treeRel = "";
        renderLibraries();
      }

      const deckDelete = event.target.closest("[data-delete-deck]");
      if (deckDelete) {
        event.stopPropagation();
        await deleteDeck(deckDelete.dataset.deleteDeck);
        return;
      }

      const deckRename = event.target.closest("[data-rename-deck]");
      if (deckRename) {
        event.stopPropagation();
        await renameDeck(deckRename.dataset.renameDeck);
        return;
      }

      const subDeck = event.target.closest("[data-subdeck]");
      if (subDeck) {
        event.stopPropagation();
        await createDeck(Number(subDeck.dataset.subdeck));
        return;
      }

      const deck = event.target.closest("[data-deck-id]");
      if (deck) {
        state.filters.deckId = String(deck.dataset.deckId || "");
        $("#deckFilter").value = state.filters.deckId;
        renderDecks();
        await loadItems();
      }

      const tree = event.target.closest("[data-tree-rel]");
      if (tree) {
        const isDir = tree.dataset.isDir === "true" || tree.classList.contains("dir");
        if (isDir) {
          await loadTree(state.activeLibraryId, tree.dataset.treeRel || "");
        } else if (tree.dataset.indexedId) {
          await startReview(tree.dataset.indexedId);
        }
      }

      if (event.target.closest("#emptyAddLibraryBtn") || event.target.closest("#emptyTableAddLibraryBtn")) {
        await chooseLibrary();
      }

      const commonPath = event.target.closest("[data-common-path]");
      if (commonPath) {
        $("#manualLibraryPath").value = commonPath.dataset.commonPath || "";
      }

      const pluginToggle = event.target.closest("[data-plugin-toggle]");
      if (pluginToggle) {
        await togglePlugin(pluginToggle.dataset.pluginToggle, pluginToggle.checked);
      }
    } catch (error) {
      reportError(error);
    }
  });

  $bind("chooseLibraryBtn","click", chooseLibrary);
  $bind("chooseLibraryBtn2","click", chooseLibrary);
  $bind("chooseFileBtn","click", chooseFile);
  $bind("chooseFileBtn2","click", chooseFile);
  $bind("newDeckBtn","click", createDeck);
  $bind("clearDeckFilterBtn","click", async () => {
    state.filters.deckId = "";
    renderDecks();
    await loadItems();
  });
  $bind("manualLibraryForm","submit", async (event) => {
    event.preventDefault();
    await addLibraryPath($("#manualLibraryPath").value);
  });
  $bind("scanAllBtn","click", scanAll);
  $bind("startDueBtn","click", () => startReview());
  $bind("reviewStartNextBtn","click", () => startReview());
  $bind("reviewOpenBtn","click", () => state.review.item && openItem(state.review.item.id));
  $bind("reviewOpenWithBtn","click", () => state.review.item && openItemWith(state.review.item.id));
  $bind("reviewFolderBtn","click", () => state.review.item && openFolder(state.review.item.id));
  $bind("reviewCreateNoteBtn","click", () => state.review.item && createNote({ itemId: state.review.item.id }));
  $bind("newNoteBtn","click", () => createNote());
  $bind("newLocalNoteBtn","click", () => createNote({ localMode: true }));
  $bind("openNotesFolderBtn","click", () => openFolderByPath(state.overview?.app?.notes_dir || state.overview?.app?.default_notes_dir));
  $bind("selectAllNotesBtn","click", () => {
    state.notes.forEach((note) => state.selectedNoteIds.add(note.id));
    renderNotesList();
  });
  $bind("clearNoteSelectionBtn","click", () => {
    state.selectedNoteIds.clear();
    renderNotesList();
  });
  $bind("exportNotesBtn","click", exportSelectedNotes);
  $bind("deleteNotesBtn","click", () => deleteSelectedNotes());
  $bind("saveNoteBtn","click", saveNote);
  $bind("openNoteBtn","click", () => openNote(false));
  $bind("openNoteWithBtn","click", () => openNote(true));
  $bind("deleteActiveNoteBtn","click", () => state.activeNoteId && deleteSelectedNotes([state.activeNoteId]));
  $bind("saveSettingsBtn","click", saveSettings);
  $bind("backupBtn","click", backup);
  $bind("healthBtn","click", healthCheck);
  $bind("portableExportBtn","click", exportPortableJson);
  $bind("profileExportBtn","click", exportProfile);
  $bind("chooseExportDirBtn","click", chooseExportDir);
  $bind("openExportDirBtn","click", openExportDir);
  $bind("chooseProfileDirBtn","click", chooseProfileDir);
  $bind("moveProfileBtn","click", moveProfile);
  $bind("chooseImportProfileBtn","click", chooseImportProfilePackage);
  $bind("importProfileBtn","click", importProfile);
  $bind("openProfileBtn","click", openProfileFolder);
  $bind("refreshPluginsBtn","click", loadPlugins);
  $bind("importPluginZipBtn","click", () => importPlugin("zip"));
  $bind("importPluginFolderBtn","click", () => importPlugin("folder"));
  $bind("openPluginsFolderBtn","click", openPluginsFolder);
  $bind("exportBtn","click", exportCsv);
  $bind("batchTagBtn","click", batchTag);
  $bind("batchDeckBtn","click", batchAssignDeck);
  $bind("batchSuspendBtn","click", batchSuspend);
  $bind("batchActivateBtn","click", () => batchSetStatus("active", t("batch.activateShort")));
  $bind("batchDoneBtn","click", () => batchSetStatus("done", t("batch.doneShort")));
  $bind("batchDueTodayBtn","click", batchDueToday);
  $bind("batchDeleteBtn","click", batchDelete);
  $bind("shareBtn","click", exportSharePackage);
  $bind("languageSelect","change", async (event) => {
    state.lang = event.target.value;
    localStorage.setItem("fileReviewerLanguage", state.lang);
    state.config.ui = state.config.ui || {};
    state.config.ui.language = state.lang;
    applyI18n();
    setView(state.view);
    renderDashboard();
    renderLibraries();
    renderDecks();
    renderItems();
  });
  $bind("onboardingCloseBtn","click", closeOnboarding);
  $bind("onboardingSkipBtn","click", closeOnboarding);
  $bind("onboardingPrevBtn","click", () => {
    if (state.onboardingStep > 0) {
      state.onboardingStep -= 1;
      renderOnboardingStep();
    }
  });
  $bind("onboardingNextBtn","click", () => {
    if (state.onboardingStep >= ONBOARDING_STEPS.length - 1) {
      closeOnboarding();
    } else {
      state.onboardingStep += 1;
      renderOnboardingStep();
    }
  });
  $bind("restartOnboardingBtn","click", startOnboarding);

  $$(".rating").forEach((button) => {
    button.addEventListener("click", () => finishReview(button.dataset.rating));
  });

  $bind("globalSearch","input", (event) => {
    state.filters.search = event.target.value;
    if (state.view !== "library") setView("library");
    clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(loadItems, 220);
  });

  $bind("statusFilter","change", (event) => {
    state.filters.status = event.target.value;
    loadItems();
  });

  $bind("deckFilter","change", (event) => {
    state.filters.deckId = event.target.value;
    renderDecks();
    loadItems();
  });

  $$(".seg").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".seg").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      state.filters.due = button.dataset.due;
      loadItems();
    });
  });

  $$(".item-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const sort = th.dataset.sort;
      if (state.filters.sort === sort) {
        state.filters.direction = state.filters.direction === "asc" ? "desc" : "asc";
      } else {
        state.filters.sort = sort;
        state.filters.direction = "asc";
      }
      loadItems();
    });
  });

  $bind("itemsBody","change", (event) => {
    if (!event.target.classList.contains("row-check")) return;
    const id = Number(event.target.dataset.id);
    if (event.target.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
  });

  $bind("selectAll","change", (event) => {
    state.selectedIds.clear();
    if (event.target.checked) state.items.forEach((item) => state.selectedIds.add(item.id));
    renderItems();
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select")) return;
    if (event.key === "r") startReview();
    if (["1", "2", "3", "4"].includes(event.key)) finishReview(Number(event.key) - 1);
    if (event.key === "/") {
      event.preventDefault();
      $("#globalSearch").focus();
    }
  });
}

async function init() {
  // Wire the client-side backend: monkeypatch window.fetch so every /api/* call
  // from the unchanged api() helper is routed to LocalAPI (IndexedDB-backed, no server).
  if (window.LocalAPI && typeof window.LocalAPI.install === "function") {
    window.LocalAPI.install();
  }
  // Open IndexedDB connection — required before any DB operation (loadOverview,
  // loadItems, etc.). Without this, _db stays null and every DB call throws
  // "Cannot read properties of null (reading 'transaction')".
  try { await DB.init(); } catch (e) { console.warn("[init] DB.init() failed:", e); }
  bindEvents();
  requestNotificationsIfNeeded();
  setupReminderLoop();
  await loadOverview();
  await loadPlugins();
  await loadItems();
  await loadNotes();
  setView("dashboard");
  showOnboardingIfNeeded();
  setInterval(loadOverview, 60000);
}

init().catch((error) => {
  reportError(error);
});

window.addEventListener("unhandledrejection", (event) => {
  reportError(event.reason || new Error("Unhandled promise rejection"));
});

window.addEventListener("error", (event) => {
  reportError(event.error || new Error(event.message));
});
