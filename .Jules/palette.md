## 2024-04-27 - Added aria-labels to icon-only buttons
**Learning:** Found several icon-only buttons across the frontend application (LeadTable, EmailReviewQueue, CampaignChatSetup) that lacked ARIA labels, making them inaccessible to screen readers. This indicates a potential pattern of relying solely on visual icons for button functionality in this codebase.
**Action:** Always verify that buttons containing only icons (like Close, Previous, Next, Send) include descriptive `aria-label` attributes to ensure keyboard and screen reader accessibility.
## 2024-05-18 - Added semantic HTML labels to forms
**Learning:** Found multiple form inputs (`<input>`, `<textarea>`) across the application (`LoginPage.tsx`, `CampaignWizard.tsx`) lacking semantic association with their corresponding `<label>` tags (missing `htmlFor` and `id`). This reduces screen reader accessibility and prevents users from focusing inputs by clicking their labels.
**Action:** When adding or reviewing forms, always ensure semantic association using `htmlFor` and `id`. Use React's `useId()` hook for reusable form primitives (like `InputField`, `TextareaField`) to guarantee unique IDs.
