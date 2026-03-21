# Web Component Composition Guide — Agent Reference

How web components compose together. Understanding composition prevents agents from writing broken nesting, incorrect slot usage, and hallucinated component interactions.

## Component Dependencies

Components can internally render other components. This creates a dependency tree. When using a parent component, its dependencies are automatically loaded.

**Example: Shoelace's sl-select depends on sl-icon, sl-popup, sl-tag**
```html
<!-- When you use sl-select, you also need sl-option loaded -->
<sl-select label="Favorite fruit">
  <sl-option value="apple">Apple</sl-option>
  <sl-option value="banana">Banana</sl-option>
  <sl-option value="cherry">Cherry</sl-option>
</sl-select>
```

**Key rule:** The parent component's internal dependencies (sl-icon, sl-popup, sl-tag) are loaded automatically — you don't import them yourself. But child components passed via slots (sl-option) must be loaded by the consumer.

**Use `get_component_dependencies` to check what a component requires.**

## Slot-Based Composition

Slots are the primary composition mechanism. Components define named slots where consumers insert content.

### Default Slot
```html
<!-- Content goes into the default (unnamed) slot -->
<sl-button>Click me</sl-button>
<sl-card>
  <p>This goes into the default slot.</p>
</sl-card>
```

### Named Slots
```html
<!-- Named slots must have slot="name" attribute -->
<sl-dialog label="Confirm">
  <!-- Default slot: main content -->
  <p>Are you sure you want to delete this?</p>
  
  <!-- Named slot: footer -->
  <sl-button slot="footer" variant="default">Cancel</sl-button>
  <sl-button slot="footer" variant="primary">Delete</sl-button>
  
  <!-- Named slot: header-actions (additional header buttons) -->
  <sl-icon-button slot="header-actions" name="gear" label="Settings"></sl-icon-button>
</sl-dialog>
```

### Slot Rules
1. **Elements without `slot` attribute go to the default slot** (if it exists)
2. **Elements with `slot="name"` go to the matching named slot**
3. **If a slot doesn't exist, the content is NOT rendered** — it's hidden
4. **Multiple elements can go into the same slot** — they're rendered in order
5. **Slots are light DOM** — you can style slotted content with normal CSS

### Common Slot Anti-Patterns

```html
<!-- WRONG: Nesting a component inside a slot that doesn't accept it -->
<sl-button>
  <sl-icon slot="prefix" name="gear"></sl-icon>  <!-- Works — 'prefix' slot exists -->
  <sl-dialog slot="popover"></sl-dialog>          <!-- WRONG — no 'popover' slot on sl-button -->
</sl-button>

<!-- WRONG: Putting content in a non-existent slot -->
<sl-card>
  <p slot="sidebar">Navigation</p>  <!-- WRONG — sl-card has no 'sidebar' slot -->
</sl-card>

<!-- WRONG: Wrapping slotted content in extra elements -->
<sl-select>
  <div>  <!-- WRONG — sl-select expects sl-option as direct children -->
    <sl-option value="a">A</sl-option>
  </div>
</sl-select>

<!-- RIGHT: Direct children in slots -->
<sl-select>
  <sl-option value="a">A</sl-option>
  <sl-option value="b">B</sl-option>
</sl-select>
```

## Common Composition Patterns

### Pattern 1: Form Controls with Labels + Help Text
```html
<sl-input 
  label="Email Address"
  help-text="We'll never share your email."
  type="email"
  placeholder="you@example.com"
  required
>
  <sl-icon name="envelope" slot="prefix"></sl-icon>
</sl-input>
```
Many form components accept: `label` (attribute or slot), `help-text` (attribute or slot), `prefix` slot, `suffix` slot.

### Pattern 2: Trigger + Content (Dropdown, Tooltip, Popover)
```html
<!-- The trigger element and the content are in different slots -->
<sl-dropdown>
  <sl-button slot="trigger" caret>Options</sl-button>
  <sl-menu>
    <sl-menu-item>Edit</sl-menu-item>
    <sl-menu-item>Duplicate</sl-menu-item>
    <sl-divider></sl-divider>
    <sl-menu-item>Delete</sl-menu-item>
  </sl-menu>
</sl-dropdown>

<sl-tooltip content="This is a tooltip">
  <sl-button>Hover me</sl-button>
</sl-tooltip>
```

### Pattern 3: Container + Items (Tabs, Accordion, Tree)
```html
<!-- Parent manages state, children provide content -->
<sl-tab-group>
  <sl-tab slot="nav" panel="general">General</sl-tab>
  <sl-tab slot="nav" panel="settings">Settings</sl-tab>
  
  <sl-tab-panel name="general">General content...</sl-tab-panel>
  <sl-tab-panel name="settings">Settings content...</sl-tab-panel>
</sl-tab-group>
```

### Pattern 4: Dialog with Actions
```html
<sl-dialog label="Edit Profile">
  <!-- Main content -->
  <sl-input label="Name" value="John"></sl-input>
  <sl-input label="Email" value="john@example.com" type="email"></sl-input>
  
  <!-- Footer actions -->
  <sl-button slot="footer" variant="default" class="dialog-cancel">Cancel</sl-button>
  <sl-button slot="footer" variant="primary" class="dialog-save">Save Changes</sl-button>
</sl-dialog>
```

## Event Communication Between Components

Components communicate upward via events. Parent components can listen to child events.

```html
<sl-select id="fruit-select">
  <sl-option value="apple">Apple</sl-option>
  <sl-option value="banana">Banana</sl-option>
</sl-select>

<script>
  // Listen on the parent — events bubble up from sl-option
  document.querySelector('#fruit-select')
    .addEventListener('sl-change', (e) => {
      console.log('Selected:', e.target.value);
    });
</script>
```

**Key rules:**
- Custom events bubble through the light DOM by default
- Events DO NOT bubble out of Shadow DOM unless `composed: true`
- Most library events are `composed: true` (they bubble through shadow boundaries)
- Use `get_component` to check what events a component emits

## Framework Integration Patterns

### React
```jsx
// React doesn't natively handle custom events — use ref or wrapper
function MyForm() {
  const selectRef = useRef(null);
  
  useEffect(() => {
    const select = selectRef.current;
    const handler = (e) => console.log(e.target.value);
    select.addEventListener('sl-change', handler);
    return () => select.removeEventListener('sl-change', handler);
  }, []);

  return (
    <sl-select ref={selectRef} label="Choice">
      <sl-option value="a">A</sl-option>
    </sl-select>
  );
}
```

### Vue
```vue
<template>
  <sl-select @sl-change="handleChange" label="Choice">
    <sl-option value="a">A</sl-option>
  </sl-select>
</template>
```

### Astro
```astro
---
// Components render in client — import their definitions
---
<sl-select label="Choice" id="my-select">
  <sl-option value="a">A</sl-option>
</sl-select>

<script>
  document.querySelector('#my-select')
    .addEventListener('sl-change', (e) => {
      console.log(e.target.value);
    });
</script>
```

## Checking Available Slots and Dependencies

Before composing components, always verify:

1. **`get_component`** — returns slots (with descriptions), events, dependencies
2. **`get_component_narrative`** — prose description with slot usage examples
3. **`suggest_usage`** — generates a complete usage snippet with all slots populated
4. **`get_component_dependencies`** — shows what other components are needed

**Never guess slot names.** Components only render content in defined slots. Unrecognized `slot="..."` values are silently ignored.
