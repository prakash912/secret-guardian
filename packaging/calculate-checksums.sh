#!/bin/bash

# Script to calculate checksums for all built installers
# Run this after: npm run make

echo "Calculating checksums for Secret Guardian installers..."
echo ""

if [ ! -d "out/make" ]; then
    echo "Error: out/make directory not found. Run 'npm run make' first."
    exit 1
fi

echo "=== macOS ==="
if ls out/make/*.dmg 1> /dev/null 2>&1; then
    for file in out/make/*.dmg; do
        echo "$(basename $file):"
        shasum -a 256 "$file" | awk '{print "  SHA256: " $1}'
    done
else
    echo "  No DMG files found"
fi

echo ""
echo "=== Windows ==="
if ls out/make/*.exe 1> /dev/null 2>&1; then
    for file in out/make/*.exe; do
        echo "$(basename $file):"
        shasum -a 256 "$file" | awk '{print "  SHA256: " $1}'
    done
else
    echo "  No EXE files found"
fi

echo ""
echo "=== Linux DEB ==="
if ls out/make/*.deb 1> /dev/null 2>&1; then
    for file in out/make/*.deb; do
        echo "$(basename $file):"
        shasum -a 256 "$file" | awk '{print "  SHA256: " $1}'
    done
else
    echo "  No DEB files found"
fi

echo ""
echo "=== Linux RPM ==="
if ls out/make/*.rpm 1> /dev/null 2>&1; then
    for file in out/make/*.rpm; do
        echo "$(basename $file):"
        shasum -a 256 "$file" | awk '{print "  SHA256: " $1}'
    done
else
    echo "  No RPM files found"
fi

echo ""
echo "Done! Copy these checksums to your package manager configuration files."


