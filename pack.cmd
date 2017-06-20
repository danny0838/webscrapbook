:: Packing Instruction
::
:: System requirements:
:: * OS: Windows
:: * 7z
::
:: Steps:
:: * Place this packing script in the main project folder.
:: * Adjust %filename% and %compressor% variables to fit your needs.
:: * Run this script, and the packed files are created in the same directory.
::
::
@echo off
set "compressor=%ProgramFiles%\7-Zip\7z.exe"
set "dir=%~dp0"
set "dir=%dir:~0,-1%"

:: Chrome extension package (for submit)
set "filename=webscrapbook.zip"
del "%dir%\%filename%"
"%compressor%" a -tzip -mx9 "%dir%\%filename%" *.* -r -x!.git* -x!*.cmd -x!*.crx -x!*.zip -x!*.xpi -x!manifest-*.json

:: Firefox addon
set "filename=webscrapbook.xpi"
del "%dir%\%filename%"
"%compressor%" a -tzip -mx9 "%dir%\%filename%" *.* -r -x!.git* -x!*.cmd -x!*.crx -x!*.zip -x!*.xpi -x!manifest.json
"%compressor%" rn "%dir%\%filename%" manifest-firefox.json manifest.json

pause
