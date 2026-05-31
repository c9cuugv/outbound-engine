## 2024-04-28 - Missing HTML For/ID attributes in Form Inputs
**Learning:** React form elements in the frontend were missing explicit association between the label and the input via the `htmlFor` and `id` tags. This creates an accessibility issue for screen readers. It also reduces the click target area size for focusing inputs since users cannot simply click the text.
**Action:** Always ensure that form inputs have IDs and that their corresponding labels use the `htmlFor` attribute linking to that ID.
