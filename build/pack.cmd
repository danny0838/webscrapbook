:: Packing Instruction
::
:: System requirements:
:: * OS: Windows
:: * 7z
::
:: Steps:
:: * Place this packing script in the main project folder.
:: * Adjust %filename% and %compressor% variables to fit your needs.
:: * Run this script, and the packed files are created in the dist\ directory.
::
::
@echo off
set "compressor=%ProgramFiles%\7-Zip\7z.exe"
set "filename=WebScrapbook"
set "dir=%~dp0"
set "dir=%dir:~0,-1%"
set "src=%dir%\..\src"
set "dist=%dir%\..\dist"

:: Chrome extension package (for submit)
set "fn=%filename%.zip"
del "%dist%\%fn%"
"%compressor%" a -tzip -mx9 "%dist%\%fn%" "%src%\"*.* -r -x!.git*
"%compressor%" d "%dist%\%fn%" manifest-firefox.json

:: Firefox addon
set "fn=%filename%.xpi"
del "%dist%\%fn%"
"%compressor%" a -tzip -mx9 "%dist%\%fn%" "%src%\"*.* -r -x!.git*
"%compressor%" d "%dist%\%fn%" manifest.json
"%compressor%" rn "%dist%\%fn%" manifest-firefox.json manifest.json
"%compressor%" d "%dist%\%fn%" _locales\zh_TW _locales\zh_CN

pause
