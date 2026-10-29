cmake_minimum_required(VERSION 3.22.1)
project(appmodules)

# El enlace del Codegen local necesita rutas CMake normalizadas en Windows.
# Conservamos el OnLoad y los proveedores oficiales de React Native.
file(TO_CMAKE_PATH "${PROJECT_BUILD_DIR}" PROJECT_BUILD_DIR)
include("${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake")
