/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ConfigReader } from '../apis';
import {
  AppTheme,
  appThemeApiRef,
  configApiRef,
  featureFlagsApiRef,
  identityApiRef,
} from '../apis/definitions';
import { ApiRegistry } from '../apis';
import { BackstagePlugin } from '../plugin';
import { AppComponents, SignInResult } from './types';

// Mock the AppThemeProvider and AppContextProvider
jest.mock('./AppThemeProvider', () => ({
  AppThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-theme-provider">{children}</div>
  ),
}));
jest.mock('./AppContext', () => ({
  AppContextProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-context">{children}</div>
  ),
}));

// Import implementations under test
const { PrivateAppImpl, useConfigLoader } = jest.requireActual('./App');

// Helper to create mock plugins
const createMockPlugin = (id: string): BackstagePlugin => ({
  getId: jest.fn().mockReturnValue(id),
  output: jest.fn().mockReturnValue([
    {
      type: 'route',
      target: { path: `/${id}` },
      component: () => <div>{id} page</div>,
    },
    { type: 'feature-flag', name: `${id}-flag` },
  ]),
  getApis: jest.fn().mockReturnValue([]),
} as unknown as BackstagePlugin);

// Utility to render components and await effects
const renderWithEffects = async (element: React.ReactElement) => {
  let result: any;
  await act(async () => { result = render(element); });
  return result;
};

describe('PrivateAppImpl', () => {
  // Mocks for components, themes, icons, and default options
  const mockComponents: AppComponents = {
    NotFoundErrorPage: () => <div>Not Found</div>,
    BootErrorPage: ({ error }) => <div>Error: {error?.message}</div>,
    Progress: () => <div>Loading...</div>,
    Router: ({ children }) => <div data-testid="router">{children}</div>,
    SignInPage: ({ onResult }) => (
      <button onClick={() => onResult({ userId: 'u', profile: { email: '', displayName: '' } })}>
        Sign In
      </button>
    ),
  };
  const mockTheme: AppTheme = {
    id: 'light',
    title: 'Light',
    variant: 'light',
    Provider: ({ children }) => <div>{children}</div>,
  };
  const mockIcons = { user: () => <div>User Icon</div> };
  const defaultOptions = {
    apis: [],
    icons: mockIcons,
    plugins: [createMockPlugin('test-plugin')],
    components: mockComponents,
    themes: [mockTheme],
    configLoader: jest.fn().mockResolvedValue([{ data: {} }]),
    defaultApis: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('constructor: creates instance', () => {
    const app = new PrivateAppImpl(defaultOptions);
    expect(app).toBeInstanceOf(PrivateAppImpl);
  });

  it('getPlugins: returns plugins', () => {
    const app = new PrivateAppImpl(defaultOptions);
    expect(app.getPlugins()).toEqual(defaultOptions.plugins);
  });

  it('getSystemIcon: returns correct icon', () => {
    const app = new PrivateAppImpl(defaultOptions);
    expect(app.getSystemIcon('user')).toBe(mockIcons.user);
  });

  describe('getRoutes', () => {
    it('collects routes and registers feature flags', () => {
      const plugins = [createMockPlugin('p1'), createMockPlugin('p2')];
      const app = new PrivateAppImpl({ ...defaultOptions, plugins });
      const mockFlags: any = { registeredFeatureFlags: [] };
      jest
        .spyOn(app as any, 'getApiHolder')
        .mockReturnValue({ get: api => (api === featureFlagsApiRef ? mockFlags : undefined) });
      const routes = app.getRoutes();
      expect(routes.length).toBe(plugins.length + 1);
      expect(mockFlags.registeredFeatureFlags).toEqual([
        { pluginId: 'p1', name: 'p1-flag' },
        { pluginId: 'p2', name: 'p2-flag' },
      ]);
    });

    it('handles legacy, redirect, and not-found routes', () => {
      const complex = {
        getId: () => 'c',
        output: () => [
          { type: 'route', target: { path: '/r' }, component: () => <div /> },
          { type: 'legacy-route', path: '/lr', component: () => <div /> },
          { type: 'redirect-route', from: { path: '/old' }, to: { path: '/new' } },
          { type: 'legacy-redirect-route', path: '/lredir', target: '/t' },
        ],
        getApis: () => [],
      } as unknown as BackstagePlugin;
      const app = new PrivateAppImpl({ ...defaultOptions, plugins: [complex] });
      jest.spyOn(app as any, 'getApiHolder').mockReturnValue({ get: () => undefined });
      expect(app.getRoutes().length).toBe(5);
    });
  });

  describe('verify', () => {
    it('passes with unique plugin IDs', () => {
      const app = new PrivateAppImpl({
        ...defaultOptions,
        plugins: [createMockPlugin('a'), createMockPlugin('b')],
      });
      expect(() => app.verify()).not.toThrow();
    });

    it('throws on duplicate plugin IDs', () => {
      const dup = createMockPlugin('dup');
      const app = new PrivateAppImpl({ ...defaultOptions, plugins: [dup, dup] });
      expect(() => app.verify()).toThrow(/duplicate plugin/i);
    });
  });
});

describe('Provider and Router Components', () => {
  const mockComponents: AppComponents = {
    NotFoundErrorPage: () => <div>Not Found</div>,
    BootErrorPage: ({ error }) => <div>Error: {error?.message}</div>,
    Progress: () => <div>Loading...</div>,
    Router: ({ children }) => <div data-testid="router">{children}</div>,
    SignInPage: ({ onResult }) => <button data-testid="sign-in-button">Sign In</button>,
  };
  const mockTheme: AppTheme = {
    id: 'light',
    title: 'Light',
    variant: 'light',
    Provider: ({ children }) => <div>{children}</div>,
  };
  const mockIcons = { user: () => <div>User Icon</div> };

  describe('getProvider', () => {
    it('returns a provider component', () => {
      const app = new PrivateAppImpl({
        apis: [],
        icons: mockIcons,
        plugins: [createMockPlugin('tp')],
        components: mockComponents,
        themes: [mockTheme],
      });
      expect(typeof app.getProvider()).toBe('function');
    });

    it('renders loading state', async () => {
      const app = new PrivateAppImpl({
        apis: [],
        icons: mockIcons,
        plugins: [],
        components: mockComponents,
        themes: [mockTheme],
        configLoader: () => new Promise(() => {}),
      });
      const Provider = app.getProvider();
      expect((await renderWithEffects(<Provider />)).getByText('Loading...')).toBeInTheDocument();
    });

    it('renders error state', async () => {
      const app = new PrivateAppImpl({
        apis: [],
        icons: mockIcons,
        plugins: [],
        components: mockComponents,
        themes: [mockTheme],
        configLoader: jest.fn().mockRejectedValue(new Error('Config failed')),
      });
      const Provider = app.getProvider();
      expect((await renderWithEffects(<Provider />)).getByText('Error: Config failed')).toBeInTheDocument();
    });
  });

  describe('getRouter', () => {
    it('returns a router component', () => {
      const app = new PrivateAppImpl({
        apis: [],
        icons: mockIcons,
        plugins: [createMockPlugin('tp')],
        components: mockComponents,
        themes: [mockTheme],
      });
      expect(typeof app.getRouter()).toBe('function');
    });

    it('assigns guest identity when SignInPage is undefined', async () => {
      const app = new PrivateAppImpl({
        apis: [],
        icons: mockIcons,
        plugins: [],
        components: { ...mockComponents, SignInPage: undefined },
        themes: [mockTheme],
      });
      app['configApi'] = { getOptionalString: () => '/' } as any;
      const spy = jest.spyOn(app['identityApi'], 'setSignInResult');
      const Router = app.getRouter();
      await renderWithEffects(<Router>Hi</Router>);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'guest', profile: expect.objectContaining({ displayName: 'Guest' }) }),
      );
    });
  });
});

describe('useConfigLoader', () => {
  const mockComponents = {
    Progress: () => <div>Loading...</div>,
    BootErrorPage: ({ error }) => <div>Error: {error?.message}</div>,
  } as AppComponents;
  const mockThemeApi = {
    getInstalledThemes: jest.fn().mockReturnValue([]),
    activeThemeId$: jest.fn().mockReturnValue({ subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }) }),
    setActiveThemeId: jest.fn(),
    getActiveThemeId: jest.fn(),
  };

  it('returns api on successful load', async () => {
    const configLoader = jest.fn().mockResolvedValue([{ data: { app: { title: 'T' } } }]);
    let result: any;
    await act(async () => { result = useConfigLoader(configLoader, mockComponents, mockThemeApi); });
    expect(result).toHaveProperty('api');
  });

  it('returns loading node while pending', () => {
    const loader = () => new Promise(() => {});
    const { node } = useConfigLoader(loader, mockComponents, mockThemeApi);
    const { getByText } = render(node!);
    expect(getByText('Loading...')).toBeInTheDocument();
  });

  it('returns error node on failure', async () => {
    const loader = jest.fn().mockRejectedValue(new Error('fail'));
    let result: any;
    await act(async () => { result = useConfigLoader(loader, mockComponents, mockThemeApi); });
    const { getByText } = render(result.node);
    expect(getByText('Error: fail')).toBeInTheDocument();
  });
});