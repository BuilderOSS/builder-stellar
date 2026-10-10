# Builder (Stellar)

## Design System

Read `DESIGN.md` before visual or UI work: it defines the fonts, colors, spacing, navigation, density rules and voice. Build UI only from `apps/web/src/components/ui` primitives and Panda tokens. No raw hex values, inline `style={{}}`, CSS modules, `<style jsx>` or new global classes in components. Ask before departing from it. When reviewing or QA-ing UI, flag code that doesn't match `DESIGN.md`.
