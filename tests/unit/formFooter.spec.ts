import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/ui/form_footer.js';

type Listener = (event: any) => void;

function createStubElement(tag: string){
  const classSet = new Set<string>();
  const listeners = new Map<string, Set<Listener>>();
  let textContent = '';

  const element: any = {
    tagName: tag.toUpperCase(),
    children: [] as any[],
    parentNode: null as any,
    dataset: {} as Record<string, string>,
    style: {},
    attributes: {} as Record<string, string>,
    get className(){
      return Array.from(classSet).join(' ');
    },
    set className(value: string){
      classSet.clear();
      String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(cls => classSet.add(cls));
    },
    classList: {
      add: (...cls: string[]) => {
        cls.filter(Boolean).forEach(clsName => classSet.add(clsName));
      },
      remove: (...cls: string[]) => {
        cls.filter(Boolean).forEach(clsName => classSet.delete(clsName));
      },
      contains: (cls: string) => classSet.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if(force === true){
          classSet.add(cls);
          return true;
        }
        if(force === false){
          classSet.delete(cls);
          return false;
        }
        if(classSet.has(cls)){
          classSet.delete(cls);
          return false;
        }
        classSet.add(cls);
        return true;
      }
    },
    get textContent(){
      return textContent;
    },
    set textContent(value: string){
      textContent = String(value ?? '');
    },
    appendChild(child: any){
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    removeChild(child: any){
      const idx = element.children.indexOf(child);
      if(idx >= 0){
        element.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    get firstChild(){
      return element.children.length ? element.children[0] : null;
    },
    addEventListener(type: string, handler: Listener){
      if(!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: Listener){
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event: any){
      const handlers = listeners.get(event.type);
      if(!handlers) return true;
      event.target = event.target || element;
      event.currentTarget = element;
      if(typeof event.preventDefault !== 'function'){
        event.preventDefault = ()=>{ event.defaultPrevented = true; };
      }
      if(typeof event.stopPropagation !== 'function'){
        event.stopPropagation = ()=>{};
      }
      handlers.forEach(listener => listener.call(element, event));
      return !event.defaultPrevented;
    },
    click(){
      element.dispatchEvent({ type: 'click', defaultPrevented: false });
    },
    setAttribute(name: string, value: string){
      element.attributes[name] = String(value);
      if(name === 'class'){
        element.className = String(value);
      }
    },
    getAttribute(name: string){
      return element.attributes[name];
    }
  };

  return element;
}

describe('FormFooter', () => {
  let createFormFooter: any;

  beforeEach(async () => {
    const documentStub = {
      createElement: (tag: string) => createStubElement(tag)
    } as unknown as Document;
    (globalThis as any).document = documentStub;
    vi.resetModules();
    ({ createFormFooter } = await import(MODULE_PATH));
  });

  afterEach(() => {
    delete (globalThis as any).document;
  });

  it('renders cancel then save buttons and emits events once', () => {
    const host = createStubElement('div');
    const form = createStubElement('form');
    const onSave = vi.fn();
    const onCancel = vi.fn();

    const footer = createFormFooter({
      host: host as unknown as HTMLElement,
      form: form as unknown as HTMLFormElement,
      saveLabel: 'Save Item',
      cancelLabel: 'Nevermind',
      onSave,
      onCancel
    });

    expect(host.children.length).toBe(2);
    expect(host.children[0].children[0]).toBe(footer.cancelButton);
    expect(host.children[1].children[0]).toBe(footer.saveButton);

    footer.cancelButton.click();
    footer.saveButton.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('maps Enter and Escape to save and cancel actions', () => {
    const host = createStubElement('div');
    const form = createStubElement('form');
    const onSave = vi.fn();
    const onCancel = vi.fn();

    const footer = createFormFooter({
      host: host as unknown as HTMLElement,
      form: form as unknown as HTMLFormElement,
      onSave,
      onCancel
    });

    form.dispatchEvent({ type: 'keydown', key: 'Enter', target: createStubElement('input') });
    form.dispatchEvent({ type: 'keydown', key: 'Escape', target: createStubElement('input') });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const textarea = createStubElement('textarea');
    form.dispatchEvent({ type: 'keydown', key: 'Enter', target: textarea });

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
