# מבחנים בבית

אפליקציית PWA בעברית למעקב אחרי המבחנים של הילדים.

- **צד לקוח:** React + Vite + vite-plugin-pwa (`src/`)
- **שרת:** Cloudflare Worker עם Hono (`worker/`), שמגיש גם את קבצי האפליקציה
- **מסד נתונים:** Cloudflare D1 (`migrations/`)

## שיתוף בין ההורים
כל משפחה מקבלת קוד סודי. במסך **הגדרות → שיתוף** שולחים קישור הצטרפות, ומי שפותח אותו רואה ועורך את אותם נתונים.

## פיתוח מקומי
```bash
npm install
npm run build
npm run dev:api   # Worker + D1 מקומי על פורט 8787
npm run dev       # Vite על פורט 5173 (מעביר את /api ל-8787)
```

## Deploy
ה-workflow `.github/workflows/deploy.yml` רץ בכל push ל-`main` (או ידנית מ-Actions):
1. בונה את האפליקציה
2. יוצר את מסד ה-D1 `chiled-exam-db` אם הוא לא קיים
3. מריץ מיגרציות
4. מעלה את ה-Worker

Secrets נדרשים ב-GitHub Actions:
- `CF_API`: טוקן API של Cloudflare עם ההרשאות *Workers Scripts: Edit* ו-*D1: Edit* (ו-*Account Settings: Read*)
- `CF_ACCOUNT_ID` (אופציונלי): רק אם לטוקן יש גישה ליותר מחשבון אחד
