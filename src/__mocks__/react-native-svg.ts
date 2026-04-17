import React from 'react';
import { View } from 'react-native';

const Svg = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(View, null, children);

const Path = () => null;

export default Svg;
export { Path };
