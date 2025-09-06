import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });
import "react-quill-new/dist/quill.snow.css";

const RichTextEditor = ({value, onChange} : {value: string; onChange: (content: string) => void;}) => {
    const [editorValue, setEditorValue] = useState(value || "");
    const quillRef = useRef(false);

    useEffect(() => {
        if(!quillRef.current) {
            quillRef.current = true;

            setTimeout(() => {
                document
                    .querySelectorAll(".ql-toolbar")
                    .forEach((toolbar, index) => {
                        if(index > 0) {
                            toolbar.remove();
                        }
                    });
            }, 100);
        }
    }, []);

    return (
        <div className="relative">
            {/* @ts-ignore */}
            <ReactQuill 
              theme="snow"
              value={editorValue}
              onChange={(content) => {
                setEditorValue(content);
                onChange(content);
              }}
              modules={{
                toolbar: [
                    [{ font: [] }],
                    [{ header: [1, 2, 3, 4, 5, 6, false] }],
                    [{ size: ["small", false, "large", "huge"] }],
                    ["bold", "italic", "underline", "strike"],
                    [{ color: [] }, { background: [] }],
                    [{ script: "super" }, { script: "sub" }],
                    [{ list: "ordered" }, { list: "bullet" }],
                    [{ indent: "-1" }, { indent: "+1" }],
                    [{ align: [] }],
                    ["blockquote", "code-block"],
                    ["link", "image", "video"],
                    ["clean"],
                ],
              }}
              placeholder="Write a detailed product description here..."
              className="bg-transparent border border-gray-700 text-white rounded-md"
              style={{minHeight: "250px"}}
            />

            <style>
                {`
                    .ql-toolbar {
                        border-color: #444;
                        background: transparent;
                    }
                    .ql-container {
                        bordercolor: #444;
                        color: white;
                        background: transparent !important;
                    }
                    .ql-picker {
                        color: white !important;
                    }
                    .ql-editor {
                        min-height: 200px;
                    }
                    .ql-snow {
                        border-color: #444 !important;
                    }
                    .ql-editor.ql-blank::before {
                        color: #aaa !important;
                    }
                    .ql-picker-options {
                        background: #333 !important; 
                        color: white !important;
                    }
                    .ql-picker-item {
                        color: white !important;
                    }
                    .ql-stroke {
                        stroke: white !important;
                    }
                `}
            </style>
        </div>
    )
};

export default RichTextEditor;